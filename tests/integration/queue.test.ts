import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/lib/db/admin";
import { backoffSeconds, claimJobs, enqueueJob, failJob, sweepExpiredLeases } from "@/lib/jobs/queue";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("queue");
});
afterAll(async () => {
  await db()`delete from public.jobs where user_id = ${user.id}`;
  await deleteTestUser(user);
  await closeDb();
});

describe("job queue", () => {
  it("deduplicates active jobs by key", async () => {
    const a = await enqueueJob(db(), { userId: user.id, type: "CREATE_EMBEDDINGS", dedupeKey: `t:${user.id}` });
    const b = await enqueueJob(db(), { userId: user.id, type: "CREATE_EMBEDDINGS", dedupeKey: `t:${user.id}` });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    await db()`update public.jobs set status = 'succeeded' where id = ${a}`;
    const c = await enqueueJob(db(), { userId: user.id, type: "CREATE_EMBEDDINGS", dedupeKey: `t:${user.id}` });
    expect(c).toBeTruthy();
    await db()`update public.jobs set status = 'cancelled' where id = ${c}`;
  });

  it("claims each job once (SKIP LOCKED) and retries with backoff until attempts run out", async () => {
    const id = await enqueueJob(db(), { userId: user.id, type: "GENERATE_QUIZ", maxAttempts: 2, priority: 0 });
    const [first, second] = await Promise.all([claimJobs(db(), "w1", 50), claimJobs(db(), "w2", 50)]);
    const claimed = [...first, ...second].filter((j) => j.id === id);
    expect(claimed).toHaveLength(1);
    const job = claimed[0]!;
    expect(job.attempt_count).toBe(1);

    const s1 = await failJob(db(), job, job.locked_by!, { message: "busy", code: "rate_limited", retryable: true });
    expect(s1).toBe("queued");
    const [row] = await db()<{ run_after: Date }[]>`select run_after from public.jobs where id = ${id}`;
    expect(row!.run_after.getTime()).toBeGreaterThan(Date.now() + 10_000);

    await db()`update public.jobs set run_after = now() where id = ${id}`;
    const [again] = (await claimJobs(db(), "w1", 50)).filter((j) => j.id === id);
    expect(again!.attempt_count).toBe(2);
    const s2 = await failJob(db(), again!, "w1", { message: "busy", code: "rate_limited", retryable: true });
    expect(s2).toBe("failed");
  });

  it("leaves excluded job types for another worker", async () => {
    const id = await enqueueJob(db(), { userId: user.id, type: "ANALYZE_AUDIO", priority: 0 });
    const skipped = await claimJobs(db(), "web-drain", 10, { excludeTypes: ["ANALYZE_VIDEO", "ANALYZE_AUDIO"] });
    expect(skipped.map((j) => j.id)).not.toContain(id);
    const claimed = await claimJobs(db(), "worker", 10);
    expect(claimed.map((j) => j.id)).toContain(id);
    await db()`update public.jobs set status = 'cancelled' where user_id = ${user.id} and status in ('queued', 'running')`;
  });

  it("does not retry permanent failures", async () => {
    const id = await enqueueJob(db(), { userId: user.id, type: "GENERATE_QUIZ", priority: 0 });
    const [job] = (await claimJobs(db(), "w3", 50)).filter((j) => j.id === id);
    expect(await failJob(db(), job!, "w3", { message: "private", code: "media_private", retryable: false })).toBe("failed");
  });

  it("reclaims expired leases and fails jobs that ran out of attempts", async () => {
    const id = await enqueueJob(db(), { userId: user.id, type: "GENERATE_QUIZ", maxAttempts: 1, priority: 0 });
    await claimJobs(db(), "crashed-worker", 50);
    await db()`update public.jobs set locked_until = now() - interval '1 minute' where id = ${id}`;
    const swept = await sweepExpiredLeases(db());
    const mine = swept.find((j) => j.id === id);
    expect(mine?.status).toBe("failed");
    expect(mine?.error_code).toBe("lease_expired");
  });

  it("uses bounded exponential backoff", () => {
    const mid = () => 0.5;
    expect(backoffSeconds(1, mid)).toBe(30);
    expect(backoffSeconds(2, mid)).toBe(120);
    expect(backoffSeconds(3, mid)).toBe(480);
    expect(backoffSeconds(10, mid)).toBe(1800);
  });
});
