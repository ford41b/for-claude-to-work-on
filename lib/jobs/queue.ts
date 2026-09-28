import type { Sql } from "@/lib/db/admin";
import type { Enums } from "@/lib/supabase/types";

/**
 * Durable Postgres job queue. Jobs are claimed with FOR UPDATE SKIP LOCKED and a lease
 * (`locked_until`). A crashed worker's jobs are reclaimed when the lease expires; after the
 * last attempt they fail with a user-visible reason, so nothing stays "processing" forever.
 */

export type JobType = Enums<"job_type">;
export type JobStatus = Enums<"job_status">;

export interface JobRow {
  id: string;
  user_id: string;
  sermon_id: string | null;
  source_id: string | null;
  type: JobType;
  status: JobStatus;
  priority: number;
  stage: string | null;
  progress: number;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  run_after: Date;
  locked_by: string | null;
  locked_until: Date | null;
  last_error: string | null;
  error_code: string | null;
  created_at: Date;
}

export interface EnqueueSpec {
  userId: string;
  sermonId?: string | null;
  sourceId?: string | null;
  type: JobType;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  runAfter?: Date;
  priority?: number;
  maxAttempts?: number;
}

/** Default priorities: user-visible, fast work first. */
export const JOB_PRIORITY: Record<JobType, number> = {
  INGEST_SERMON: 10,
  PROCESS_PHOTO: 20,
  EXTRACT_SCRIPTURE: 25,
  PROCESS_DOCUMENT: 30,
  GENERATE_STUDY: 30,
  BUILD_SERMON_PACK: 40,
  ANALYZE_VIDEO: 50,
  ANALYZE_AUDIO: 50,
  CREATE_EMBEDDINGS: 60,
  GENERATE_FLASHCARDS: 70,
  GENERATE_QUIZ: 70,
  GENERATE_AUDIO_RECAP: 90,
  GENERATE_VIDEO_RECAP: 90,
};

/** Lease length per job type (seconds). Long handlers also heartbeat. */
export const JOB_LEASE_SECONDS: Partial<Record<JobType, number>> = {
  ANALYZE_VIDEO: 20 * 60,
  ANALYZE_AUDIO: 20 * 60,
};
export const DEFAULT_LEASE_SECONDS = 6 * 60;

/**
 * Inserts a job unless an equivalent (same dedupe key) is already queued or running.
 * Returns the new job id, or null when deduplicated.
 */
export async function enqueueJob(sql: Sql, spec: EnqueueSpec): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    insert into public.jobs (user_id, sermon_id, source_id, type, payload, dedupe_key, run_after, priority, max_attempts)
    values (
      ${spec.userId},
      ${spec.sermonId ?? null},
      ${spec.sourceId ?? null},
      ${spec.type},
      ${sql.json((spec.payload ?? {}) as never)},
      ${spec.dedupeKey ?? null},
      ${spec.runAfter ?? new Date()},
      ${spec.priority ?? JOB_PRIORITY[spec.type]},
      ${spec.maxAttempts ?? 3}
    )
    on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running')
    do nothing
    returning id`;
  return rows[0]?.id ?? null;
}

/** Claims up to `limit` runnable jobs for this worker. */
export async function claimJobs(
  sql: Sql,
  workerId: string,
  limit: number,
  options: { excludeTypes?: JobType[]; allowYouTubeVideo?: boolean } = {},
): Promise<JobRow[]> {
  const exclude = options.excludeTypes ?? [];
  // A YouTube analysis is one provider request (no file transfer), so it can run where other
  // excluded media jobs can't, such as a serverless function.
  const youtubeException =
    options.allowYouTubeVideo && exclude.includes("ANALYZE_VIDEO")
      ? sql`or (j0.type = 'ANALYZE_VIDEO' and exists (
            select 1 from public.video_sources v where v.source_id = j0.source_id and v.origin = 'youtube'))`
      : sql``;
  return sql<JobRow[]>`
    with next as (
      select j0.id from public.jobs j0
      where j0.status = 'queued' and j0.run_after <= now()
        ${exclude.length ? sql`and (j0.type not in ${sql(exclude)} ${youtubeException})` : sql``}
      order by j0.priority, j0.run_after
      for update skip locked
      limit ${limit}
    )
    update public.jobs j
       set status = 'running',
           locked_by = ${workerId},
           locked_until = now() + make_interval(secs => case j.type
             when 'ANALYZE_VIDEO' then ${JOB_LEASE_SECONDS.ANALYZE_VIDEO!}::double precision
             when 'ANALYZE_AUDIO' then ${JOB_LEASE_SECONDS.ANALYZE_AUDIO!}::double precision
             else ${DEFAULT_LEASE_SECONDS}::double precision end),
           attempt_count = j.attempt_count + 1,
           started_at = coalesce(j.started_at, now()),
           last_error = null,
           error_code = null
      from next
     where j.id = next.id
    returning j.id, j.user_id, j.sermon_id, j.source_id, j.type, j.status, j.priority, j.stage, j.progress,
              j.payload, j.attempt_count, j.max_attempts, j.run_after, j.locked_by, j.locked_until,
              j.last_error, j.error_code, j.created_at`;
}

export async function heartbeat(
  sql: Sql,
  job: Pick<JobRow, "id" | "type">,
  workerId: string,
  update: { stage?: string; progress?: number } = {},
): Promise<boolean> {
  const lease = JOB_LEASE_SECONDS[job.type] ?? DEFAULT_LEASE_SECONDS;
  const rows = await sql`
    update public.jobs
       set locked_until = now() + make_interval(secs => ${lease}::double precision),
           stage = coalesce(${update.stage ?? null}::text, stage),
           progress = coalesce(${update.progress ?? null}::int, progress)
     where id = ${job.id} and locked_by = ${workerId} and status = 'running'
    returning id`;
  return rows.length > 0;
}

export interface CompletionMeta {
  result?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
}

export async function completeJob(sql: Sql, jobId: string, workerId: string, meta: CompletionMeta = {}) {
  await sql`
    update public.jobs
       set status = 'succeeded',
           progress = 100,
           completed_at = now(),
           locked_by = null,
           locked_until = null,
           result = ${meta.result ? sql.json(meta.result as never) : null},
           usage = ${sql.json((meta.usage ?? {}) as never)},
           provider = coalesce(${meta.provider ?? null}::text, provider),
           model = coalesce(${meta.model ?? null}::text, model),
           prompt_version = coalesce(${meta.promptVersion ?? null}::text, prompt_version)
     where id = ${jobId} and locked_by = ${workerId}`;
}

/** Exponential backoff with jitter: ~30s, ~2m, ~8m, … capped at 30 minutes. */
export function backoffSeconds(attempt: number, random: () => number = Math.random): number {
  const base = 30 * 4 ** Math.max(0, attempt - 1);
  const capped = Math.min(base, 30 * 60);
  return Math.round(capped * (0.8 + random() * 0.4));
}

export interface FailureInfo {
  message: string;
  code: string;
  retryable: boolean;
  detail?: string;
}

/** Records a failure. Returns the resulting status ('queued' for a retry, else 'failed'). */
export async function failJob(sql: Sql, job: JobRow, workerId: string, failure: FailureInfo): Promise<JobStatus> {
  const willRetry = failure.retryable && job.attempt_count < job.max_attempts;
  const runAfter = new Date(Date.now() + backoffSeconds(job.attempt_count) * 1000);
  const rows = await sql<{ status: JobStatus }[]>`
    update public.jobs
       set status = ${willRetry ? "queued" : "failed"},
           run_after = ${willRetry ? runAfter : new Date()},
           completed_at = ${willRetry ? null : new Date()},
           locked_by = null,
           locked_until = null,
           last_error = ${failure.message.slice(0, 1000)},
           error_code = ${failure.code.slice(0, 64)},
           result = ${failure.detail ? sql.json({ error_detail: failure.detail.slice(0, 2000) } as never) : null}
     where id = ${job.id} and locked_by = ${workerId}
    returning status`;
  return rows[0]?.status ?? "failed";
}

/**
 * Requeues jobs whose lease expired (worker crashed or was stopped) and fails those that have
 * used all attempts. Returns jobs that became terminally failed so side effects can run.
 */
export async function sweepExpiredLeases(sql: Sql): Promise<JobRow[]> {
  return sql<JobRow[]>`
    update public.jobs
       set status = case when attempt_count >= max_attempts then 'failed'::public.job_status else 'queued'::public.job_status end,
           completed_at = case when attempt_count >= max_attempts then now() else null end,
           run_after = now(),
           locked_by = null,
           locked_until = null,
           last_error = case when attempt_count >= max_attempts
             then 'Processing stopped unexpectedly and ran out of retries.'
             else last_error end,
           error_code = case when attempt_count >= max_attempts then 'lease_expired' else error_code end
     where status = 'running' and locked_until < now()
    returning id, user_id, sermon_id, source_id, type, status, priority, stage, progress, payload,
              attempt_count, max_attempts, run_after, locked_by, locked_until, last_error, error_code, created_at`;
}
