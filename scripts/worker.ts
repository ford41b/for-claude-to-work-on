import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/**
 * Long-running job worker. Run with `npm run worker` next to `npm run dev`, or as its own
 * process/container in production (see docs/DEPLOYMENT.md).
 */
async function main() {
  const { serverEnv } = await import("@/lib/config/env");
  const { db, closeDb } = await import("@/lib/db/admin");
  const { runWorkerLoop } = await import("@/lib/jobs/runner");
  const env = serverEnv();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  if (env.aiProvider === "none") console.warn("[worker] AI_PROVIDER is none: media analysis, OCR and Sermon Packs will be skipped.");
  if (env.aiProvider === "fixture") console.warn("[worker] Using the synthetic TEST AI provider. Never use this in production.");
  await runWorkerLoop(db(), { concurrency: env.WORKER_CONCURRENCY, signal: controller.signal });
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
