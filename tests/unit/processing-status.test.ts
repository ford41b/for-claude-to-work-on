import { describe, expect, it } from "vitest";
import { computeStatus } from "@/lib/sermons/status";

const job = (over: Record<string, unknown>) => ({
  id: "j1",
  type: "BUILD_SERMON_PACK" as const,
  status: "failed" as const,
  stage: null,
  progress: 0,
  last_error: "The AI service is temporarily unavailable. We'll retry automatically.",
  error_code: "unavailable",
  result: { error_detail: "[model=gemini-x prompt=sermon-pack] 500 An internal error has occurred." },
  source_id: null,
  updated_at: "2026-10-02T00:00:00Z",
  created_at: "2026-10-02T00:00:00Z",
  ...over,
});

const status = (j: ReturnType<typeof job>) =>
  computeStatus({ jobs: [j], finished: true, packVersion: null, packStale: false, sources: [] }).stages.find((s) => s.key === "pack")!;

describe("processing status for a step that failed for good", () => {
  it("does not promise an automatic retry that will not happen, and exposes the provider's error", () => {
    const pack = status(job({}));
    expect(pack.state).toBe("failed");
    expect(pack.error?.message).not.toMatch(/retry automatically/);
    expect(pack.error?.message).toMatch(/Try again/);
    expect(pack.error?.detail).toContain("500 An internal error");
  });

  it("keeps internal (non-AI) error text out of the page", () => {
    const pack = status(job({ error_code: "internal", result: { error_detail: "Error: connect ECONNREFUSED db.internal:5432" } }));
    expect(pack.error?.detail).toBeNull();
  });

  it("while retries remain, says so and shows why the last try stopped", () => {
    const pack = status(job({ status: "queued", attempt_count: 1, max_attempts: 3 }));
    expect(pack.detail).toBe("Retrying soon (try 2 of 3)");
    expect(pack.error).toBeNull();
    expect(pack.lastAttempt).toEqual({ code: "unavailable", detail: expect.stringContaining("500 An internal error") });
  });

  it("shows no last-try details for a step that hasn't failed yet", () => {
    expect(status(job({ status: "queued", last_error: null, error_code: null, result: null })).lastAttempt).toBeNull();
  });
});
