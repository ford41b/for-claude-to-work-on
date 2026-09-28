import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db/admin";
import { webDrainOptions } from "@/lib/http/context";
import { AppError } from "@/lib/http/errors";
import { json, route } from "@/lib/http/route";
import { drainQueue } from "@/lib/jobs/runner";

// Must match DRAIN_FUNCTION_SECONDS; Next.js needs a literal here.
export const maxDuration = 300;

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Serverless worker: drains the job queue until the time budget ends (Vercel Cron, etc.). */
async function handler(req: Request) {
  const startedAt = Date.now();
  const env = serverEnv();
  if (!authorized(req.headers.get("authorization"), env.CRON_SECRET)) {
    throw new AppError("unauthorized", "Not allowed.");
  }
  const processed = await drainQueue(db(), { budgetMs: 240_000, concurrency: env.WORKER_CONCURRENCY, ...webDrainOptions(startedAt) });
  return json({ processed });
}

export const POST = route("internal.jobs.run", handler);
export const GET = route("internal.jobs.run", handler);
