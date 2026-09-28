import type { Sql } from "@/lib/db/admin";
import type { TokenUsage } from "@/lib/ai/types";
import type { JobRow } from "./queue";

export interface JobContext {
  job: JobRow;
  sql: Sql;
  signal: AbortSignal;
  /** Updates the user-visible stage text/progress and extends the lease. */
  progress(stage: string, percent?: number): Promise<void>;
}

export interface JobOutcome {
  result?: Record<string, unknown>;
  usage?: TokenUsage & { estimatedCostUsd?: number | null };
  provider?: string;
  model?: string;
  promptVersion?: string;
}

export type JobHandler = (ctx: JobContext) => Promise<JobOutcome | void>;

/** A failure that retrying cannot fix (bad input, missing data). Shown to the user as-is. */
export class PermanentJobError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PermanentJobError";
    this.code = code;
  }
}
