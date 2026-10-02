import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { AIError, isAIError } from "@/lib/ai/errors";
import type { Sql } from "@/lib/db/admin";
import { errorFields, log } from "@/lib/observability/log";
import { PermanentJobError, type JobContext, type JobHandler } from "./context";
import { analyzeMedia } from "./handlers/analyze-media";
import { buildSermonPack } from "./handlers/build-pack";
import { createEmbeddings } from "./handlers/create-embeddings";
import { extractScripture } from "./handlers/extract-scripture";
import { generateStudy } from "./handlers/generate-study";
import { ingestSermon } from "./handlers/ingest-sermon";
import { processDocument } from "./handlers/process-document";
import { processPhoto } from "./handlers/process-photo";
import { maybeScheduleSynthesis } from "./pipeline";
import { claimJobs, completeJob, failJob, heartbeat, sweepExpiredLeases, type FailureInfo, type JobRow, type JobType } from "./queue";

const HANDLERS: Partial<Record<JobType, JobHandler>> = {
  INGEST_SERMON: ingestSermon,
  ANALYZE_VIDEO: analyzeMedia,
  ANALYZE_AUDIO: analyzeMedia,
  PROCESS_PHOTO: processPhoto,
  PROCESS_DOCUMENT: processDocument,
  EXTRACT_SCRIPTURE: extractScripture,
  BUILD_SERMON_PACK: buildSermonPack,
  CREATE_EMBEDDINGS: createEmbeddings,
  GENERATE_STUDY: generateStudy,
};

/** Hard per-attempt time limits. */
const TIMEOUT_MS: Partial<Record<JobType, number>> = {
  ANALYZE_VIDEO: 18 * 60_000,
  ANALYZE_AUDIO: 18 * 60_000,
  BUILD_SERMON_PACK: 6 * 60_000,
  PROCESS_DOCUMENT: 6 * 60_000,
};
const DEFAULT_TIMEOUT_MS = 4 * 60_000;

/**
 * Jobs whose time limit is longer than a request-scoped or cron drain can count on when the
 * host is serverless (the platform stops the function mid-job). Those drains leave them to a
 * long-running worker; see lib/http/context.ts.
 */
export const LONG_JOB_TYPES: JobType[] = ["ANALYZE_VIDEO", "ANALYZE_AUDIO"];

const SOURCE_JOBS = new Set<JobType>(["INGEST_SERMON", "ANALYZE_VIDEO", "ANALYZE_AUDIO", "PROCESS_PHOTO", "PROCESS_DOCUMENT"]);
const UNAVAILABLE_CODES = new Set(["media_private", "media_unavailable", "media_unsupported", "media_too_long", "content_blocked"]);

export function newWorkerId(): string {
  return `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

export function classifyFailure(err: unknown): FailureInfo {
  if (isAIError(err)) return { message: err.message, code: err.code, retryable: err.retryable, detail: err.detail };
  if (err instanceof PermanentJobError) return { message: err.message, code: err.code, retryable: false };
  if (err instanceof Error && err.name === "AbortError") {
    return { message: "Processing took too long. We'll try again.", code: "timeout", retryable: true };
  }
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return { message: "Something went wrong while processing. We'll try again.", code: "internal", retryable: true, detail };
}

/** Side effects when a job has failed for good: surface the reason on the source/study row. */
export async function onTerminalFailure(sql: Sql, job: JobRow, failure: Pick<FailureInfo, "code" | "message">) {
  try {
    if (SOURCE_JOBS.has(job.type) && job.source_id) {
      const status = UNAVAILABLE_CODES.has(failure.code) ? "unavailable" : "failed";
      await sql`
        update public.sermon_sources set status = ${status}, error_code = ${failure.code}, error_message = ${failure.message}
        where id = ${job.source_id}`;
    }
    if (job.type === "GENERATE_STUDY" && job.payload.studyGuideId) {
      await sql`
        update public.study_guides set status = 'failed', error_message = ${failure.message}
        where id = ${String(job.payload.studyGuideId)}`;
    }
    if (job.sermon_id && SOURCE_JOBS.has(job.type)) await maybeScheduleSynthesis(sql, job.sermon_id);
  } catch (err) {
    log.error("job.terminal_side_effect_failed", { job_id: job.id, ...errorFields(err) });
  }
}

/**
 * `deadline` (epoch ms) is when the host will stop this process, as in a serverless function.
 * The attempt's time limit is cut short to end before it, so the job fails cleanly and retries
 * instead of being killed mid-run and waiting out its lease.
 */
export async function runJob(
  sql: Sql,
  job: JobRow,
  workerId: string,
  options: { deadline?: number } = {},
): Promise<"succeeded" | "retry" | "failed"> {
  const handler = HANDLERS[job.type];
  const started = Date.now();
  if (!handler) {
    const failure = { message: "This kind of processing isn't available yet.", code: "not_implemented", retryable: false };
    await failJob(sql, job, workerId, failure);
    await onTerminalFailure(sql, job, failure);
    return "failed";
  }
  const controller = new AbortController();
  const limitMs = TIMEOUT_MS[job.type] ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = options.deadline ? Math.max(1_000, Math.min(limitMs, options.deadline - Date.now())) : limitMs;
  const timeout = setTimeout(() => controller.abort(new AIError("timeout", { detail: "job time limit reached" })), timeoutMs);
  const beat = setInterval(() => void heartbeat(sql, job, workerId).catch(() => {}), 60_000);
  const ctx: JobContext = {
    job,
    sql,
    signal: controller.signal,
    progress: async (stage, percent) => {
      await heartbeat(sql, job, workerId, { stage, progress: percent });
    },
  };
  try {
    const outcome = (await handler(ctx)) ?? {};
    await completeJob(sql, job.id, workerId, {
      result: outcome.result ?? null,
      usage: (outcome.usage as unknown as Record<string, unknown>) ?? null,
      provider: outcome.provider,
      model: outcome.model,
      promptVersion: outcome.promptVersion,
    });
    log.info("job.succeeded", { job_id: job.id, type: job.type, attempt: job.attempt_count, ms: Date.now() - started, model: outcome.model });
    return "succeeded";
  } catch (err) {
    const failure = classifyFailure(controller.signal.aborted && !isAIError(err) ? new AIError("timeout") : err);
    const status = await failJob(sql, job, workerId, failure);
    log.warn("job.failed", {
      job_id: job.id,
      type: job.type,
      attempt: job.attempt_count,
      code: failure.code,
      detail: failure.detail?.slice(0, 1500),
      will_retry: status === "queued",
      ms: Date.now() - started,
    });
    if (status === "failed") await onTerminalFailure(sql, job, failure);
    return status === "queued" ? "retry" : "failed";
  } finally {
    clearTimeout(timeout);
    clearInterval(beat);
  }
}

/** A YouTube analysis is only started when at least this much of the host's time is left. */
export const MIN_YOUTUBE_ANALYSIS_MS = 150_000;

/**
 * Synthesis jobs make one long model request (a Sermon Pack can take a few minutes). Starting
 * one with less time than this left on a serverless host would only end in a cut-off attempt,
 * so it waits for the next drain instead.
 */
export const MIN_SYNTHESIS_MS: Partial<Record<JobType, number>> = {
  BUILD_SERMON_PACK: 150_000,
  GENERATE_STUDY: 90_000,
};

export interface BatchOptions {
  excludeTypes?: JobType[];
  /** Still claim ANALYZE_VIDEO for YouTube sources when it is in `excludeTypes`. */
  allowYouTubeVideo?: boolean;
  /** When the host stops this process (epoch ms); see runJob. */
  hardDeadline?: number;
}

/** Claims and runs one batch. Returns the number of jobs processed. */
export async function processBatch(sql: Sql, workerId: string, limit: number, options: BatchOptions = {}): Promise<number> {
  const expired = await sweepExpiredLeases(sql);
  for (const job of expired.filter((j) => j.status === "failed")) {
    await onTerminalFailure(sql, job, { code: job.error_code ?? "lease_expired", message: job.last_error ?? "Processing stopped unexpectedly." });
  }
  const timeLeft = options.hardDeadline ? options.hardDeadline - Date.now() : Infinity;
  const tooLong = (Object.entries(MIN_SYNTHESIS_MS) as [JobType, number][]).filter(([, ms]) => timeLeft < ms).map(([type]) => type);
  const jobs = await claimJobs(sql, workerId, limit, {
    excludeTypes: [...(options.excludeTypes ?? []), ...tooLong],
    allowYouTubeVideo: options.allowYouTubeVideo && timeLeft >= MIN_YOUTUBE_ANALYSIS_MS,
  });
  await Promise.all(jobs.map((job) => runJob(sql, job, workerId, { deadline: options.hardDeadline })));
  return jobs.length;
}

/** Drains the queue until it is empty or the time budget is spent (serverless runner). */
export async function drainQueue(
  sql: Sql,
  options: { budgetMs: number; concurrency: number; workerId?: string } & BatchOptions,
): Promise<number> {
  const workerId = options.workerId ?? newWorkerId();
  const deadline = Date.now() + options.budgetMs;
  let total = 0;
  while (Date.now() < deadline) {
    const n = await processBatch(sql, workerId, options.concurrency, options);
    total += n;
    if (n === 0) break;
  }
  return total;
}

/** Long-running worker loop (`npm run worker`). */
export async function runWorkerLoop(
  sql: Sql,
  options: { concurrency: number; pollMs?: number; signal: AbortSignal; workerId?: string },
): Promise<void> {
  const workerId = options.workerId ?? newWorkerId();
  const pollMs = options.pollMs ?? 1500;
  const running = new Set<Promise<unknown>>();
  log.info("worker.started", { worker_id: workerId, concurrency: options.concurrency });
  let lastSweep = 0;
  while (!options.signal.aborted) {
    try {
      if (Date.now() - lastSweep > 30_000) {
        lastSweep = Date.now();
        const expired = await sweepExpiredLeases(sql);
        for (const job of expired.filter((j) => j.status === "failed")) {
          await onTerminalFailure(sql, job, { code: job.error_code ?? "lease_expired", message: job.last_error ?? "Processing stopped unexpectedly." });
        }
      }
      const free = options.concurrency - running.size;
      if (free > 0) {
        const jobs = await claimJobs(sql, workerId, free);
        for (const job of jobs) {
          const p = runJob(sql, job, workerId).finally(() => running.delete(p));
          running.add(p);
        }
        if (jobs.length) continue;
      }
    } catch (err) {
      log.error("worker.loop_error", errorFields(err));
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  log.info("worker.stopping", { worker_id: workerId, in_flight: running.size });
  await Promise.allSettled([...running]);
}
