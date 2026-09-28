import { isAIConfigured } from "@/lib/ai/registry";
import { detectScripture } from "@/lib/pack/scripture-detect";
import { persistScriptureDetections } from "@/lib/pack/persist";
import { buildCatalog } from "@/lib/sources/catalog";
import { PermanentJobError, type JobHandler } from "../context";
import { enqueueJob } from "../queue";
import { scheduleEmbeddings } from "../pipeline";

/**
 * EXTRACT_SCRIPTURE: deterministic detection across all evidence (works without AI), then
 * hands off to BUILD_SERMON_PACK when AI is configured.
 */
export const extractScripture: JobHandler = async ({ job, sql, progress }) => {
  if (!job.sermon_id) throw new PermanentJobError("bad_job", "Missing sermon.");
  await progress("Identifying Scripture", 30);
  const catalog = await buildCatalog(sql, job.sermon_id);
  if (!catalog) throw new PermanentJobError("not_found", "This sermon no longer exists.");
  const detections = detectScripture(catalog.units, catalog.refs);
  await persistScriptureDetections(sql, catalog.sermon, detections);

  if (isAIConfigured() && catalog.units.length > 0) {
    await enqueueJob(sql, {
      userId: job.user_id,
      sermonId: job.sermon_id,
      type: "BUILD_SERMON_PACK",
      dedupeKey: `pack:${job.sermon_id}`,
      payload: job.payload.force ? { force: true } : {},
    });
  } else {
    // Without AI there is no pack, but full-text search over the evidence still works.
    await scheduleEmbeddings(sql, job.user_id, job.sermon_id);
  }
  return { result: { references: detections.length, units: catalog.units.length } };
};
