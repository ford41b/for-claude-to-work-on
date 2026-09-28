import "server-only";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db/admin";
import { drainQueue, LONG_JOB_TYPES, type BatchOptions } from "@/lib/jobs/runner";
import { errorFields, log } from "@/lib/observability/log";
import type { ServiceContext } from "@/lib/sermons/service";

export async function serviceContext(): Promise<ServiceContext> {
  const { supabase, user } = await requireUser();
  return { supabase, userId: user.id, sql: db() };
}

/** Time a serverless function may run; routes that drain the queue export this as `maxDuration`. */
export const DRAIN_FUNCTION_SECONDS = 300;

/**
 * How web-tier drains (after-request and cron) run on this host. On serverless hosts they leave
 * uploaded-media analysis to the long-running worker, since downloading and re-uploading a
 * recording can outlast the function. A YouTube analysis is a single provider request, so it runs
 * here, cut short before the function's end (`startedAt` + DRAIN_FUNCTION_SECONDS).
 */
export function webDrainOptions(startedAt: number = Date.now()): BatchOptions {
  const mode = serverEnv().WEB_DRAIN_MEDIA;
  const serverless = mode === "off" || (mode === "auto" && Boolean(process.env.VERCEL));
  if (!serverless) return {};
  return {
    excludeTypes: LONG_JOB_TYPES,
    allowYouTubeVideo: mode === "auto",
    hardDeadline: startedAt + (DRAIN_FUNCTION_SECONDS - 20) * 1000,
  };
}

/**
 * After a request that enqueued work, drain the queue in the background (serverless-friendly).
 * A dedicated worker process (npm run worker) or the cron route does the same; running both is
 * safe because jobs are claimed with SKIP LOCKED.
 */
export function kickWorker() {
  if (process.env.INLINE_WORKER === "off") return;
  const startedAt = Date.now();
  after(async () => {
    try {
      await drainQueue(db(), { budgetMs: 50_000, concurrency: serverEnv().WORKER_CONCURRENCY, ...webDrainOptions(startedAt) });
    } catch (err) {
      log.error("worker.inline_failed", errorFields(err));
    }
  });
}
