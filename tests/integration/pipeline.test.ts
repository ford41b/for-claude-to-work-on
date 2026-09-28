import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureEmbedding } from "@/lib/ai/providers/fixture";
import { closeDb, db } from "@/lib/db/admin";
import { drainQueue } from "@/lib/jobs/runner";
import { addCapture, saveNote } from "@/lib/notes/service";
import { vectorLiteral } from "@/lib/retrieval/chunk";
import { createSermon, finishSermon, rebuildPack, type ServiceContext } from "@/lib/sermons/service";
import { getProcessingStatus } from "@/lib/sermons/status";
import { completeUpload, requestUpload } from "@/lib/uploads/service";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

let alice: TestUser;
let ctx: ServiceContext;
let sermonId: string;

const noteDoc = {
  type: "doc" as const,
  content: [
    { type: "heading", attrs: { id: "h1", level: 2 }, content: [{ type: "text", text: "Faith in the Waiting" }] },
    {
      type: "paragraph",
      attrs: { id: "p1" },
      content: [
        { type: "timestamp", attrs: { seconds: 1130 } },
        { type: "text", text: " God works while I wait. Waiting is not the absence of faith." },
      ],
    },
    { type: "paragraph", attrs: { id: "p2" }, content: [{ type: "text", text: "Look up Romans 8:28 again this week." }] },
  ],
};

async function drain() {
  // Jobs scheduled with a short delay (embeddings) are pulled forward so tests don't wait.
  for (let i = 0; i < 6; i++) {
    await db()`update public.jobs set run_after = now() where status = 'queued' and user_id = ${alice.id}`;
    const n = await drainQueue(db(), { budgetMs: 60_000, concurrency: 3 });
    if (n === 0) break;
  }
}

beforeAll(async () => {
  alice = await createTestUser("pipeline");
  ctx = { supabase: alice.client, userId: alice.id, sql: db() };
});

afterAll(async () => {
  await deleteTestUser(alice);
  await closeDb();
});

describe("sermon processing pipeline (synthetic AI provider)", () => {
  it("processes sources before Finish without building a pack", async () => {
    const created = await createSermon(ctx, { youtubeUrl: "https://youtu.be/Fx7WaitSrm1?t=45" });
    sermonId = created.id;
    const saved = await saveNote(ctx, created.noteId, { baseVersion: 1, title: "Notes", content: noteDoc });
    expect(saved).toEqual({ status: "saved", version: 2 });
    await addCapture(ctx, sermonId, { clientId: randomUUID(), kind: "QUESTION", text: "How do I wait well when I'm anxious?", timestampSeconds: 1900 });
    await addCapture(ctx, sermonId, { clientId: randomUUID(), kind: "BOOKMARK", text: "", timestampSeconds: 2010 });

    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const target = await requestUpload(ctx, {
      sermonId,
      kind: "photo",
      mimeType: "image/png",
      sizeBytes: png.length,
      filename: "slide.png",
      sermonTimestampSeconds: 1700,
    });
    expect(target.method).toBe("signed");
    const up = await alice.client.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token!, png, { contentType: "image/png" });
    expect(up.error).toBeNull();
    await completeUpload(ctx, target.mediaFileId);

    await drain();
    const status = await getProcessingStatus(alice.client, sermonId);
    expect(status?.packVersion).toBeNull();
    expect(status?.stages.map((s) => [s.key, s.state])).toEqual(
      expect.arrayContaining([
        ["prepare", "done"],
        ["understand", "done"],
        ["photos", "done"],
      ]),
    );
    const { data: photo } = await alice.client.from("photos").select("preview_file_id, current_ocr_id, width").single();
    expect(photo?.preview_file_id).toBeTruthy();
    expect(photo?.current_ocr_id).toBeTruthy();
    expect(photo?.width).toBe(800);
  });

  it("builds a grounded Sermon Pack after Finish", async () => {
    await finishSermon(ctx, sermonId);
    await drain();

    const { data: sermon } = await alice.client.from("sermons").select("*").eq("id", sermonId).single();
    expect(sermon?.current_pack_id).toBeTruthy();
    expect(sermon?.title).toBe("Faith in the Waiting");
    expect(sermon?.big_idea).toMatch(/active expression of trust/);

    const status = await getProcessingStatus(alice.client, sermonId);
    expect(status?.overall).toBe("ready");
    expect(status?.packVersion).toBe(1);

    // Every citation points at a real source that belongs to this sermon.
    const { data: sources } = await alice.client.from("sermon_sources").select("id, source_type").eq("sermon_id", sermonId);
    const sourceIds = new Set(sources!.map((s) => s.id));
    const { data: citations } = await alice.client.from("source_citations").select("*").eq("sermon_id", sermonId);
    expect(citations!.length).toBeGreaterThan(10);
    for (const c of citations!) expect(sourceIds.has(c.source_id)).toBe(true);

    const { data: ideas } = await alice.client.from("main_ideas").select("*").eq("sermon_id", sermonId).order("position");
    expect(ideas!.length).toBeGreaterThanOrEqual(1);
    expect(ideas![0]!.timestamp_start).not.toBeNull();
    expect(ideas![0]!.timestamp_confidence).not.toBeNull();

    const { data: scripture } = await alice.client.from("scripture_references").select("normalized_reference, kind").eq("sermon_id", sermonId);
    const refs = scripture!.map((s) => s.normalized_reference);
    expect(refs).toEqual(expect.arrayContaining(["Romans 8:24–25", "Romans 8:28", "Psalm 27:14", "Philippians 4:6–7"]));

    const { data: quotes } = await alice.client.from("quotes").select("text, quote_type, verbatim_evidence").eq("sermon_id", sermonId);
    for (const q of quotes!) {
      if (q.quote_type === "VERBATIM_QUOTE") expect(q.verbatim_evidence).toBeTruthy();
    }
    expect(quotes!.some((q) => q.quote_type === "PARAPHRASE")).toBe(true);

    const { data: moments } = await alice.client.from("sermon_moments").select("origin, timestamp_start, timestamp_source").eq("sermon_id", sermonId);
    expect(moments!.filter((m) => m.origin === "ai").every((m) => m.timestamp_start !== null && m.timestamp_source === "ai")).toBe(true);
    expect(moments!.filter((m) => m.origin === "user")).toHaveLength(2);

    const { data: review } = await alice.client.from("review_items").select("kind").eq("sermon_id", sermonId);
    expect(review!.length).toBeGreaterThan(0);
  });

  it("indexes every source for hybrid retrieval", async () => {
    const { data: chunks } = await alice.client.from("source_chunks").select("source_type, embedding_model, note_block_ids").eq("sermon_id", sermonId);
    const types = new Set(chunks!.map((c) => c.source_type));
    expect(types).toEqual(new Set(["SERMON_VIDEO", "USER_NOTE", "PHOTO"]));
    expect(chunks!.every((c) => c.embedding_model === "fixture-embedding")).toBe(true);

    const query = "What did I write about God working while I wait?";
    const { data: hits, error } = await alice.client.rpc("match_source_chunks", {
      p_sermon_id: sermonId,
      p_query_text: query,
      p_query_embedding: vectorLiteral(fixtureEmbedding(query)),
      p_match_count: 5,
    });
    expect(error).toBeNull();
    expect(hits![0]!.text).toMatch(/God works while I wait/);
    expect(hits![0]!.note_block_ids).toContain("p1");
  });

  it("preserves user edits and corrected timestamps across regeneration", async () => {
    const { data: idea } = await alice.client.from("main_ideas").select("id, title").eq("sermon_id", sermonId).order("position").limit(1).single();
    await alice.client.from("main_ideas").update({ title: "My wording of this idea", user_edited: true }).eq("id", idea!.id);
    const { data: moment } = await alice.client
      .from("sermon_moments")
      .select("id, timestamp_start")
      .eq("sermon_id", sermonId)
      .eq("origin", "ai")
      .order("timestamp_start")
      .limit(1)
      .single();
    await alice.client
      .from("sermon_moments")
      .update({ timestamp_start: 50, original_timestamp_start: moment!.timestamp_start, timestamp_source: "user_correction", verification_status: "user_corrected", user_edited: true })
      .eq("id", moment!.id);

    await rebuildPack(ctx, sermonId);
    await drain();

    const { data: ideas } = await alice.client.from("main_ideas").select("id, title, user_edited, pack_artifact_id").eq("sermon_id", sermonId);
    const mine = ideas!.find((i) => i.id === idea!.id);
    expect(mine?.title).toBe("My wording of this idea");
    const { data: m2 } = await alice.client.from("sermon_moments").select("timestamp_start, timestamp_source").eq("id", moment!.id).single();
    expect(m2).toEqual({ timestamp_start: 50, timestamp_source: "user_correction" });

    const { data: packs } = await alice.client.from("ai_artifacts").select("version, status").eq("sermon_id", sermonId).eq("type", "SERMON_PACK").order("version");
    expect(packs).toEqual([
      { version: 1, status: "superseded" },
      { version: 2, status: "ready" },
    ]);
  });

  it("does not re-analyze an unchanged recording", async () => {
    const { data: analyses } = await alice.client.from("ai_artifacts").select("id").eq("sermon_id", sermonId).eq("type", "VIDEO_ANALYSIS");
    expect(analyses).toHaveLength(1);
  });

  it("explains private videos and falls back without retrying", async () => {
    const created = await createSermon(ctx, { youtubeUrl: "https://www.youtube.com/watch?v=Fx7Private1" });
    await drain();
    const { data: src } = await alice.client.from("sermon_sources").select("status, error_code, error_message").eq("sermon_id", created.id).eq("source_type", "SERMON_VIDEO").single();
    expect(src).toMatchObject({ status: "unavailable", error_code: "media_private" });
    expect(src!.error_message).toMatch(/can't be analyzed directly from its YouTube URL/);
    const { data: jobs } = await alice.client.from("jobs").select("status, attempt_count").eq("sermon_id", created.id).eq("type", "ANALYZE_VIDEO");
    expect(jobs).toEqual([{ status: "failed", attempt_count: 1 }]);
  });
});
