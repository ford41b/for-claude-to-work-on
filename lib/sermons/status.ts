import type { AppSupabaseClient, Enums } from "@/lib/supabase/types";

/**
 * Processing status is *computed* from real jobs and sources — never a free-floating flag — so a
 * notebook cannot show "processing" once every job has reached a terminal state.
 */

export type StageKey = "prepare" | "understand" | "photos" | "documents" | "scripture" | "pack" | "search";
export type StageState = "pending" | "running" | "done" | "failed" | "skipped";

export interface Stage {
  key: StageKey;
  label: string;
  state: StageState;
  detail: string | null;
  progress: number | null;
  error: { code: string; message: string } | null;
}

export interface ProcessingStatus {
  overall: "idle" | "processing" | "ready" | "attention";
  stages: Stage[];
  finished: boolean;
  packVersion: number | null;
  packStale: boolean;
  /** Changes whenever anything visible changes; the client refetches page data when it does. */
  dataVersion: string;
}

interface JobLite {
  id: string;
  type: Enums<"job_type">;
  status: Enums<"job_status">;
  stage: string | null;
  progress: number;
  last_error: string | null;
  error_code: string | null;
  source_id: string | null;
  updated_at: string;
  created_at: string;
}

const STAGE_DEFS: { key: StageKey; label: string; types: Enums<"job_type">[] }[] = [
  { key: "prepare", label: "Preparing sermon", types: ["INGEST_SERMON"] },
  { key: "understand", label: "Understanding the sermon", types: ["ANALYZE_VIDEO", "ANALYZE_AUDIO"] },
  { key: "photos", label: "Reading photos", types: ["PROCESS_PHOTO"] },
  { key: "documents", label: "Reading documents", types: ["PROCESS_DOCUMENT"] },
  { key: "scripture", label: "Identifying Scripture", types: ["EXTRACT_SCRIPTURE"] },
  { key: "pack", label: "Building your Sermon Pack", types: ["BUILD_SERMON_PACK"] },
  { key: "search", label: "Preparing AI search", types: ["CREATE_EMBEDDINGS"] },
];

export function computeStatus(input: {
  jobs: JobLite[];
  finished: boolean;
  packVersion: number | null;
  packStale: boolean;
  sources: { id: string; status: string; error_code: string | null; error_message: string | null; updated_at: string }[];
}): ProcessingStatus {
  // Latest job per (type, source).
  const latest = new Map<string, JobLite>();
  for (const j of [...input.jobs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    latest.set(`${j.type}:${j.source_id ?? ""}`, j);
  }
  const jobs = [...latest.values()];

  const stages: Stage[] = [];
  for (const def of STAGE_DEFS) {
    const relevant = jobs.filter((j) => def.types.includes(j.type));
    if (!relevant.length) continue;
    const running = relevant.find((j) => j.status === "running");
    const queued = relevant.find((j) => j.status === "queued");
    const failed = relevant.filter((j) => j.status === "failed");
    const state: StageState = running ? "running" : queued ? "pending" : failed.length ? "failed" : "done";
    const countNote =
      def.key === "photos" && relevant.length > 1
        ? `${relevant.filter((j) => j.status === "succeeded").length} of ${relevant.length} read`
        : null;
    const firstFailure = failed[0];
    stages.push({
      key: def.key,
      label: def.label,
      state,
      detail: running?.stage ?? (queued ? (queued.last_error ? "Retrying soon" : "Waiting to start") : countNote),
      progress: running ? running.progress : null,
      error: firstFailure ? { code: firstFailure.error_code ?? "failed", message: firstFailure.last_error ?? "This step failed." } : null,
    });
  }

  const active = stages.some((s) => s.state === "running" || s.state === "pending");
  const anyFailed = stages.some((s) => s.state === "failed");
  const overall: ProcessingStatus["overall"] = active ? "processing" : anyFailed ? "attention" : input.packVersion ? "ready" : "idle";

  const versionParts = [
    ...jobs.map((j) => `${j.id}:${j.status}:${j.progress}`),
    ...input.sources.map((s) => `${s.id}:${s.status}:${s.updated_at}`),
    `pack:${input.packVersion ?? 0}:${input.packStale}`,
  ];
  return {
    overall,
    stages,
    finished: input.finished,
    packVersion: input.packVersion,
    packStale: input.packStale,
    dataVersion: String(versionParts.join("|").length) + ":" + simpleHash(versionParts.join("|")),
  };
}

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function getProcessingStatus(supabase: AppSupabaseClient, sermonId: string): Promise<ProcessingStatus | null> {
  const [sermon, jobs, sources] = await Promise.all([
    supabase.from("sermons").select("status, pack_stale, current_pack_id, ai_artifacts!sermons_current_pack_fk(version)").eq("id", sermonId).maybeSingle(),
    supabase
      .from("jobs")
      .select("id, type, status, stage, progress, last_error, error_code, source_id, updated_at, created_at")
      .eq("sermon_id", sermonId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("sermon_sources").select("id, status, error_code, error_message, updated_at").eq("sermon_id", sermonId),
  ]);
  if (sermon.error) throw sermon.error;
  if (!sermon.data) return null;
  if (jobs.error) throw jobs.error;
  if (sources.error) throw sources.error;
  const pack = sermon.data.ai_artifacts as { version: number } | null;
  return computeStatus({
    jobs: jobs.data as JobLite[],
    finished: sermon.data.status === "finished",
    packVersion: pack?.version ?? null,
    packStale: sermon.data.pack_stale,
    sources: sources.data,
  });
}
