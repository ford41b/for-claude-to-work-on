import { randomUUID } from "node:crypto";
import { UPLOAD_LIMITS } from "@/lib/config/app";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { imageAnalysisPrompt, photoFullText } from "@/lib/ai/prompts/image-analysis";
import { getModelProvider, isAIConfigured } from "@/lib/ai/registry";
import { sermonAI } from "@/lib/ai/service";
import { hashJson } from "@/lib/hash";
import { imageInfo, makeAnalysisRendition, makePreview } from "@/lib/media/images";
import { downloadBytes, objectPath, uploadBytes, type Bucket } from "@/lib/storage/objects";
import { PermanentJobError, type JobHandler } from "../context";
import { maybeScheduleSynthesis, scheduleEmbeddings } from "../pipeline";

/**
 * PROCESS_PHOTO: preview rendition (EXIF-stripped), then OCR/structure via the AI provider.
 * The original image is preserved as evidence. A user-corrected transcription is never
 * replaced: a new AI reading is stored as a non-current version instead.
 */
export const processPhoto: JobHandler = async ({ job, sql, signal, progress }) => {
  if (!job.source_id || !job.sermon_id) throw new PermanentJobError("bad_job", "Missing source.");
  const [photo] = await sql<
    {
      bucket: Bucket;
      path: string;
      mime_type: string;
      sha256: string | null;
      preview_file_id: string | null;
      sermon_title: string;
      current_origin: string | null;
    }[]
  >`
    select m.bucket, m.path, m.mime_type, m.sha256, p.preview_file_id, s.title as sermon_title, o.origin as current_origin
    from public.photos p
    join public.media_files m on m.id = p.original_file_id
    join public.sermons s on s.id = p.sermon_id
    left join public.ocr_extractions o on o.id = p.current_ocr_id
    where p.source_id = ${job.source_id} and m.status = 'verified'`;
  if (!photo) throw new PermanentJobError("not_found", "This photo is missing or hasn't finished uploading.");

  await sql`update public.sermon_sources set status = 'processing', error_code = null, error_message = null where id = ${job.source_id}`;
  await progress("Preparing the photo", 10);
  const original = await downloadBytes(photo.bucket, photo.path, UPLOAD_LIMITS.photo);

  // 1) Preview (skip if one already exists).
  if (!photo.preview_file_id) {
    const preview = await makePreview(original);
    const info = await imageInfo(original);
    if (preview) {
      const fileId = randomUUID();
      const path = objectPath(job.user_id, job.sermon_id, fileId, "preview.webp");
      await uploadBytes("derived", path, preview.data, preview.mimeType);
      await sql.begin(async (tx) => {
        await tx`
          insert into public.media_files (id, sermon_id, user_id, source_id, kind, bucket, path, mime_type, size_bytes, status, width, height, verified_at)
          values (${fileId}, ${job.sermon_id}, ${job.user_id}, ${job.source_id}, 'photo_preview', 'derived', ${path}, ${preview.mimeType},
                  ${preview.data.byteLength}, 'verified', ${preview.width}, ${preview.height}, now())`;
        await tx`update public.photos set preview_file_id = ${fileId}, width = ${info.width}, height = ${info.height} where source_id = ${job.source_id}`;
      });
    } else {
      await sql`update public.photos set width = ${info.width}, height = ${info.height} where source_id = ${job.source_id}`;
    }
  }

  // 2) Transcription.
  if (!isAIConfigured()) {
    await sql`
      update public.sermon_sources
         set status = 'ready', error_code = 'ai_not_configured',
             error_message = 'Photo saved. Automatic text reading is unavailable; you can type what it says.'
       where id = ${job.source_id}`;
    await maybeScheduleSynthesis(sql, job.sermon_id);
    return { result: { ocr: "skipped_ai_not_configured" } };
  }

  const provider = getModelProvider();
  const model = provider.modelFor(imageAnalysisPrompt.tier);
  const inputHash = hashJson({ sha256: photo.sha256 ?? photo.path, prompt: imageAnalysisPrompt.version, model, provider: provider.id });
  if (!job.payload.force) {
    const cached = await sql`
      select id from public.ai_artifacts
      where source_id = ${job.source_id} and type = 'PHOTO_ANALYSIS' and input_hash = ${inputHash} and status = 'ready' limit 1`;
    if (cached.length) {
      await sql`update public.sermon_sources set status = 'processed', processed_at = now() where id = ${job.source_id}`;
      await maybeScheduleSynthesis(sql, job.sermon_id);
      return { result: { cached: true } };
    }
  }

  await progress("Reading the photo", 40);
  const rendition = await makeAnalysisRendition(original);
  const image = rendition ? { mimeType: rendition.mimeType, data: rendition.data } : { mimeType: photo.mime_type, data: original };
  const run = await sermonAI.analyzeImage({ image, sermonTitle: photo.sermon_title || null }, signal);
  const out = run.output;
  const fullText = photoFullText(out);
  const cost = estimateCostUsd(run.model, run.usage);

  await sql.begin(async (tx) => {
    await tx`update public.ai_artifacts set status = 'superseded' where source_id = ${job.source_id} and type = 'PHOTO_ANALYSIS' and status = 'ready'`;
    const [artifact] = await tx<{ id: string }[]>`
      insert into public.ai_artifacts (sermon_id, user_id, source_id, type, status, input_hash, provider, model, prompt_version,
                                       structured_content, input_source_ids, usage)
      values (${job.sermon_id}, ${job.user_id}, ${job.source_id}, 'PHOTO_ANALYSIS', 'ready', ${inputHash}, ${run.provider}, ${run.model},
              ${run.promptVersion}, ${tx.json(out as never)}, ${[job.source_id!]},
              ${tx.json({ ...run.usage, estimated_cost_usd: cost } as never)})
      returning id`;
    const [versionRow] = await tx<{ next: number }[]>`
      select coalesce(max(version), 0) + 1 as next from public.ocr_extractions where photo_source_id = ${job.source_id}`;
    const next = versionRow!.next;
    // A user's own correction stays authoritative; the new AI reading is kept as a suggestion.
    const makeCurrent = photo.current_origin !== "user";
    if (makeCurrent) {
      await tx`update public.ocr_extractions set is_current = false where photo_source_id = ${job.source_id} and is_current`;
    }
    const [ocr] = await tx<{ id: string }[]>`
      insert into public.ocr_extractions (photo_source_id, sermon_id, user_id, version, origin, is_current, photo_kind, title, full_text,
                                          blocks, overall_confidence, legibility_note, artifact_id)
      values (${job.source_id}, ${job.sermon_id}, ${job.user_id}, ${next}, 'ai', ${makeCurrent}, ${out.photo_kind}, ${out.title},
              ${fullText}, ${tx.json(out.blocks as never)}, ${out.overall_confidence}, ${out.legibility_note}, ${artifact!.id})
      returning id`;
    if (makeCurrent) await tx`update public.photos set current_ocr_id = ${ocr!.id} where source_id = ${job.source_id}`;
    await tx`
      update public.sermon_sources
         set status = 'processed', processed_at = now(), content_hash = ${photo.sha256},
             error_code = ${out.blocks.length === 0 ? "no_text" : null},
             error_message = ${out.blocks.length === 0 ? (out.legibility_note ?? "No text was found in this photo.") : null}
       where id = ${job.source_id}`;
  });

  await maybeScheduleSynthesis(sql, job.sermon_id);
  await scheduleEmbeddings(sql, job.user_id, job.sermon_id, 15);
  return {
    result: { blocks: out.blocks.length, confidence: out.overall_confidence },
    usage: { ...run.usage, estimatedCostUsd: cost },
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
  };
};
