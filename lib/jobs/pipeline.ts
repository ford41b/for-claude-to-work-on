import type { Sql } from "@/lib/db/admin";
import { enqueueJob, type JobType } from "./queue";

/**
 * Pipeline scheduling rules (see ARCHITECTURE.md §F):
 *   source jobs (ANALYZE_*, PROCESS_*) run as soon as evidence is added;
 *   once the sermon is finished and no source job is pending → EXTRACT_SCRIPTURE
 *   → BUILD_SERMON_PACK → CREATE_EMBEDDINGS. Edits after finishing schedule a debounced rebuild.
 */

export const SOURCE_JOB_TYPES: JobType[] = ["INGEST_SERMON", "ANALYZE_VIDEO", "ANALYZE_AUDIO", "PROCESS_PHOTO", "PROCESS_DOCUMENT"];

export async function hasPendingSourceJobs(sql: Sql, sermonId: string): Promise<boolean> {
  const rows = await sql`
    select 1 from public.jobs
    where sermon_id = ${sermonId} and status in ('queued', 'running') and type in ${sql(SOURCE_JOB_TYPES)}
    limit 1`;
  return rows.length > 0;
}

/** Enqueues Scripture extraction (which chains the pack build) when a finished sermon is ready. */
export async function maybeScheduleSynthesis(sql: Sql, sermonId: string, options: { delaySeconds?: number } = {}) {
  const [sermon] = await sql<{ user_id: string; status: string }[]>`
    select user_id, status from public.sermons where id = ${sermonId}`;
  if (!sermon || sermon.status !== "finished") return null;
  if (await hasPendingSourceJobs(sql, sermonId)) return null;
  return enqueueJob(sql, {
    userId: sermon.user_id,
    sermonId,
    type: "EXTRACT_SCRIPTURE",
    dedupeKey: `scripture:${sermonId}`,
    runAfter: options.delaySeconds ? new Date(Date.now() + options.delaySeconds * 1000) : undefined,
  });
}

export async function scheduleEmbeddings(sql: Sql, userId: string, sermonId: string, delaySeconds = 0) {
  return enqueueJob(sql, {
    userId,
    sermonId,
    type: "CREATE_EMBEDDINGS",
    dedupeKey: `embeddings:${sermonId}`,
    runAfter: new Date(Date.now() + delaySeconds * 1000),
  });
}

export function sourceJobFor(sourceType: string): JobType | null {
  switch (sourceType) {
    case "SERMON_VIDEO":
      return "INGEST_SERMON";
    case "UPLOADED_VIDEO":
      return "ANALYZE_VIDEO";
    case "UPLOADED_AUDIO":
      return "ANALYZE_AUDIO";
    case "PHOTO":
      return "PROCESS_PHOTO";
    case "DOCUMENT":
      return "PROCESS_DOCUMENT";
    default:
      return null;
  }
}

export async function enqueueSourceJob(
  sql: Sql,
  source: { id: string; sermon_id: string; user_id: string; source_type: string },
  options: { force?: boolean } = {},
) {
  const type = sourceJobFor(source.source_type);
  if (!type) return null;
  return enqueueJob(sql, {
    userId: source.user_id,
    sermonId: source.sermon_id,
    sourceId: source.id,
    type,
    payload: options.force ? { force: true } : {},
    dedupeKey: `${type}:${source.id}`,
  });
}
