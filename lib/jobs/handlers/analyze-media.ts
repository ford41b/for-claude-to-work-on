import { AIError } from "@/lib/ai/errors";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { sermonAnalysisPrompt, type MediaAnalysis } from "@/lib/ai/prompts/sermon-analysis";
import { getModelProvider } from "@/lib/ai/registry";
import { sermonAI } from "@/lib/ai/service";
import type { PreparedMedia } from "@/lib/ai/types";
import { hashJson } from "@/lib/hash";
import type { StoredMediaAnalysis } from "@/lib/sources/catalog";
import { downloadToTempFile, type Bucket } from "@/lib/storage/objects";
import { parseTimestamp } from "@/lib/time/timestamps";
import { PermanentJobError, type JobHandler } from "../context";
import { maybeScheduleSynthesis, scheduleEmbeddings } from "../pipeline";

/**
 * ANALYZE_VIDEO / ANALYZE_AUDIO: the canonical, run-once media analysis. Cached by
 * (source content hash, prompt version, model): re-running the pipeline never re-bills a
 * recording that has not changed.
 */

const toSeconds = (v: string | null | undefined) => (v ? parseTimestamp(v) : null);

/** Converts the model's MM:SS strings into seconds, clamps to duration, and drops malformed spans. */
export function normalizeMediaAnalysis(a: MediaAnalysis, knownDuration: number | null): StoredMediaAnalysis {
  const duration = knownDuration ?? toSeconds(a.duration);
  const clamp = (s: number | null) => (s === null ? null : duration ? Math.min(Math.max(0, s), duration) : Math.max(0, s));
  const segments = a.segments
    .map((s) => ({
      start: clamp(toSeconds(s.start))!,
      end: clamp(toSeconds(s.end))!,
      kind: s.kind,
      summary: s.summary.trim(),
      key_phrases: s.key_phrases.map((p) => p.trim()).filter(Boolean),
      scripture_mentions: s.scripture_mentions.map((p) => p.trim()).filter(Boolean),
      on_screen_text: s.on_screen_text?.trim() || null,
      timing_confidence: s.timing_confidence,
    }))
    .filter((s) => s.start !== null && s.end !== null && s.summary)
    .map((s) => (s.end < s.start ? { ...s, end: s.start } : s))
    .sort((x, y) => x.start - y.start);
  return {
    is_sermon: a.is_sermon,
    content_note: a.content_note,
    duration_seconds: duration,
    sermon_start_seconds: clamp(toSeconds(a.sermon_start)),
    sermon_end_seconds: clamp(toSeconds(a.sermon_end)),
    segments,
    quotes: a.quotes
      .map((q) => ({ text: q.text.trim(), at: clamp(toSeconds(q.at)) ?? 0, heard_verbatim: q.heard_verbatim, confidence: q.confidence }))
      .filter((q) => q.text),
    illustrations: a.illustrations.map((i) => ({
      title: i.title.trim(),
      summary: i.summary.trim(),
      kind: i.kind,
      start: clamp(toSeconds(i.start)) ?? 0,
      end: clamp(toSeconds(i.end)),
    })),
    metadata: a.metadata,
  };
}

export const analyzeMedia: JobHandler = async ({ job, sql, signal, progress }) => {
  if (!job.source_id || !job.sermon_id) throw new PermanentJobError("bad_job", "Missing source.");
  const [source] = await sql<
    {
      source_type: string;
      origin: string | null;
      youtube_video_id: string | null;
      video_title: string | null;
      channel_title: string | null;
      duration_seconds: number | null;
      bucket: string | null;
      path: string | null;
      mime_type: string | null;
      sha256: string | null;
      original_filename: string | null;
      content_hash: string | null;
    }[]
  >`
    select s.source_type, v.origin, v.youtube_video_id, v.title as video_title, v.channel_title,
           coalesce(v.duration_seconds, a.duration_seconds) as duration_seconds,
           m.bucket, m.path, m.mime_type, m.sha256, m.original_filename, s.content_hash
    from public.sermon_sources s
    left join public.video_sources v on v.source_id = s.id
    left join public.audio_sources a on a.source_id = s.id
    left join public.media_files m on m.id = coalesce(v.media_file_id, a.media_file_id)
    where s.id = ${job.source_id}`;
  if (!source) throw new PermanentJobError("not_found", "This recording no longer exists.");

  const isYouTube = source.origin === "youtube";
  const audioOnly = source.source_type === "UPLOADED_AUDIO";
  if (!isYouTube && (!source.bucket || !source.path)) throw new PermanentJobError("not_found", "The uploaded recording is missing.");

  const provider = getModelProvider();
  const model = provider.modelFor(sermonAnalysisPrompt.tier);
  const identity = isYouTube ? { youtube: source.youtube_video_id } : { sha256: source.sha256, path: source.path };
  const inputHash = hashJson({ identity, prompt: sermonAnalysisPrompt.version, model, provider: provider.id });
  const artifactType = audioOnly ? "AUDIO_ANALYSIS" : "VIDEO_ANALYSIS";

  if (!job.payload.force) {
    const cached = await sql`
      select id from public.ai_artifacts
      where source_id = ${job.source_id} and type = ${artifactType} and input_hash = ${inputHash} and status = 'ready'
      limit 1`;
    if (cached.length) {
      await sql`update public.sermon_sources set status = 'processed', processed_at = now(), error_code = null, error_message = null where id = ${job.source_id}`;
      await maybeScheduleSynthesis(sql, job.sermon_id);
      return { result: { cached: true } };
    }
  }

  await sql`update public.sermon_sources set status = 'processing', error_code = null, error_message = null where id = ${job.source_id}`;
  let prepared: PreparedMedia | null = null;
  let cleanup: (() => Promise<void>) | null = null;
  try {
    let media: Parameters<typeof sermonAI.analyzeVideo>[0]["media"];
    if (isYouTube) {
      media = { kind: "youtube", url: `https://www.youtube.com/watch?v=${source.youtube_video_id}` };
    } else {
      await progress("Preparing your recording", 10);
      const tmp = await downloadToTempFile(source.bucket as Bucket, source.path!, source.original_filename ?? "recording");
      cleanup = tmp.cleanup;
      prepared = await sermonAI.prepareMedia({
        filePath: tmp.filePath,
        mimeType: source.mime_type ?? "application/octet-stream",
        displayName: `sermon-${job.sermon_id}`,
        signal,
        onProgress: (stage) => void progress(stage, 25),
      });
      media = { kind: "prepared", ref: prepared };
    }

    await progress("Listening to the sermon and finding its sections", 40);
    const run = await (audioOnly ? sermonAI.analyzeAudio : sermonAI.analyzeVideo)(
      { media, audioOnly, known: { title: source.video_title, channel: source.channel_title, durationSeconds: source.duration_seconds } },
      signal,
    );
    const stored = normalizeMediaAnalysis(run.output, source.duration_seconds);
    if (stored.segments.length === 0 && stored.is_sermon) {
      throw new AIError("invalid_output", { detail: "analysis returned no segments" });
    }

    await progress("Saving the timeline", 90);
    const cost = estimateCostUsd(run.model, run.usage);
    await sql.begin(async (tx) => {
      await tx`
        update public.ai_artifacts set status = 'superseded'
        where source_id = ${job.source_id} and type = ${artifactType} and status = 'ready'`;
      await tx`
        insert into public.ai_artifacts (sermon_id, user_id, source_id, type, status, input_hash, provider, model, prompt_version,
                                         structured_content, input_source_ids, usage)
        values (${job.sermon_id}, ${job.user_id}, ${job.source_id}, ${artifactType}, 'ready', ${inputHash}, ${run.provider},
                ${run.model}, ${run.promptVersion}, ${tx.json(stored as never)}, ${[job.source_id!]},
                ${tx.json({ ...run.usage, estimated_cost_usd: cost, repaired: run.repaired } as never)})`;
      if (stored.duration_seconds) {
        await tx`update public.video_sources set duration_seconds = coalesce(duration_seconds, ${stored.duration_seconds}) where source_id = ${job.source_id}`;
        await tx`update public.audio_sources set duration_seconds = coalesce(duration_seconds, ${stored.duration_seconds}) where source_id = ${job.source_id}`;
      }
      await tx`
        update public.sermon_sources
           set status = 'processed', processed_at = now(),
               error_code = ${stored.is_sermon ? null : "not_a_sermon"},
               error_message = ${stored.is_sermon ? null : (stored.content_note ?? "This recording doesn't appear to contain a sermon.")}
         where id = ${job.source_id}`;
    });

    await maybeScheduleSynthesis(sql, job.sermon_id);
    await scheduleEmbeddings(sql, job.user_id, job.sermon_id, 15);
    return {
      result: { segments: stored.segments.length, is_sermon: stored.is_sermon, repaired: run.repaired },
      usage: { ...run.usage, estimatedCostUsd: cost },
      provider: run.provider,
      model: run.model,
      promptVersion: run.promptVersion,
    };
  } finally {
    if (prepared) await sermonAI.releaseMedia(prepared).catch(() => {});
    if (cleanup) await cleanup().catch(() => {});
  }
};
