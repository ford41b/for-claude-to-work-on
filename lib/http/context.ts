import "server-only";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db/admin";
import { drainQueue } from "@/lib/jobs/runner";
import { errorFields, log } from "@/lib/observability/log";
import type { ServiceContext } from "@/lib/sermons/service";

export async function serviceContext(): Promise<ServiceContext> {
  const { supabase, user } = await requireUser();
  return { supabase, userId: user.id, sql: db() };
}

/**
 * After a request that enqueued work, drain the queue in the background (serverless-friendly).
 * A dedicated worker process (npm run worker) or the cron route does the same; running both is
 * safe because jobs are claimed with SKIP LOCKED.
 */
export function kickWorker() {
  if (process.env.INLINE_WORKER === "off") return;
  after(async () => {
    try {
      await drainQueue(db(), { budgetMs: 50_000, concurrency: serverEnv().WORKER_CONCURRENCY });
    } catch (err) {
      log.error("worker.inline_failed", errorFields(err));
    }
  });
}
