import { estimateCostUsd } from "@/lib/ai/pricing";
import { SERMON_PACK_PROMPT_VERSION } from "@/lib/ai/prompts/sermon-pack";
import { sermonAI } from "@/lib/ai/service";
import { combineHashes } from "@/lib/hash";
import { persistPack } from "@/lib/pack/persist";
import { resolvePack } from "@/lib/pack/resolve";
import { detectScripture } from "@/lib/pack/scripture-detect";
import { buildCatalog } from "@/lib/sources/catalog";
import { log } from "@/lib/observability/log";
import { PermanentJobError, type JobHandler } from "../context";
import { enqueueJob } from "../queue";
import { scheduleEmbeddings } from "../pipeline";

/**
 * BUILD_SERMON_PACK: synthesizes the canonical Sermon Pack from cached analyses + user content.
 * Skips work when nothing changed since the current pack (same source version hash). Re-checks
 * for edits that arrived while it ran and schedules one more rebuild if needed.
 */
export const buildSermonPack: JobHandler = async ({ job, sql, signal, progress }) => {
  if (!job.sermon_id) throw new PermanentJobError("bad_job", "Missing sermon.");
  await progress("Gathering your sources", 10);
  const catalog = await buildCatalog(sql, job.sermon_id);
  if (!catalog) throw new PermanentJobError("not_found", "This sermon no longer exists.");
  if (catalog.units.length === 0) {
    throw new PermanentJobError(
      "nothing_to_analyze",
      "There's nothing to build a Sermon Pack from yet. Add notes, photos, or a recording and try again.",
    );
  }

  const versionHash = combineHashes([catalog.sourceVersionHash, SERMON_PACK_PROMPT_VERSION]);
  if (!job.payload.force && catalog.sermon.current_pack_id) {
    const [current] = await sql<{ source_version_hash: string | null }[]>`
      select source_version_hash from public.ai_artifacts where id = ${catalog.sermon.current_pack_id}`;
    if (current?.source_version_hash === versionHash) {
      await sql`update public.sermons set pack_stale = false where id = ${job.sermon_id}`;
      return { result: { skipped: "unchanged" } };
    }
  }

  const detections = detectScripture(catalog.units, catalog.refs);
  await progress("Connecting your notes, photos, and the sermon", 35);
  const run = await sermonAI.buildSermonPack(
    {
      sermon: {
        title: catalog.sermon.title || null,
        speaker: catalog.sermon.speaker,
        church: catalog.sermon.church,
        series: catalog.sermon.series,
        date: catalog.sermon.preached_on,
        userSetFields: catalog.sermon.corrected_fields,
      },
      hasRecording: catalog.hasRecording,
      recordingNote: catalog.recordingNote,
      units: catalog.units,
      detectedScripture: detections.map((d) => ({
        reference: d.normalized,
        kind: d.kind,
        keys: [...new Set(d.citations.map((c) => c.sourceKey))].slice(0, 6),
      })),
    },
    signal,
  );

  await progress("Checking every citation against your sources", 80);
  const plan = resolvePack(run.output, {
    refs: catalog.refs,
    durationSeconds: catalog.recording?.durationSeconds ?? null,
    hasRecording: catalog.hasRecording,
    detections,
  });
  if (plan.stats.droppedKeys.length) {
    log.warn("pack.citations_dropped", { sermon_id: job.sermon_id, dropped: plan.stats.droppedKeys.length });
  }

  const cost = estimateCostUsd(run.model, run.usage);
  const { packId, version } = await persistPack(sql, {
    sermon: catalog.sermon,
    plan,
    structuredContent: {
      draft: run.output,
      catalog: [...catalog.refs.values()].map((r) => ({
        key: r.key,
        source_id: r.sourceId,
        source_type: r.sourceType,
        note_block_id: r.noteBlockId,
        timestamp_start: r.timestampStart,
        timestamp_end: r.timestampEnd,
        page: r.page,
      })),
      stats: plan.stats,
      counts: catalog.counts,
      repaired: run.repaired,
    },
    sourceVersionHash: versionHash,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    usage: run.usage,
    inputSourceIds: [...new Set([...catalog.refs.values()].map((r) => r.sourceId))],
  });

  await scheduleEmbeddings(sql, job.user_id, job.sermon_id);

  // Edits that landed during synthesis → one more (debounced) rebuild.
  const after = await buildCatalog(sql, job.sermon_id);
  if (after && combineHashes([after.sourceVersionHash, SERMON_PACK_PROMPT_VERSION]) !== versionHash) {
    await sql`update public.sermons set pack_stale = true where id = ${job.sermon_id}`;
    await enqueueJob(sql, {
      userId: job.user_id,
      sermonId: job.sermon_id,
      type: "EXTRACT_SCRIPTURE",
      dedupeKey: `scripture:${job.sermon_id}`,
      runAfter: new Date(Date.now() + 60_000),
    });
  }

  return {
    result: { pack_id: packId, version, ...plan.stats, dropped_keys: plan.stats.droppedKeys.length },
    usage: { ...run.usage, estimatedCostUsd: cost },
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
  };
};
