import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, closeSql, createTestUser, deleteTestUser, sql, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let sermonId: string;
let noteId: string;

beforeAll(async () => {
  alice = await createTestUser("alice");
  bob = await createTestUser("bob");
  const { data, error } = await alice.client
    .from("sermons")
    .insert({ title: "Faith in the Waiting", speaker: "Pastor Ruth", corrected_fields: ["title", "speaker"] })
    .select()
    .single();
  if (error) throw error;
  sermonId = data.id;
  const note = await alice.client.rpc("create_note", { p_sermon_id: sermonId, p_title: "Notes" });
  if (note.error) throw note.error;
  noteId = note.data.id;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  await closeSql();
});

describe("tenant isolation (RLS)", () => {
  it("creates a profile and settings for new users", async () => {
    const { data } = await alice.client.from("user_settings").select("*").single();
    expect(data?.user_id).toBe(alice.id);
  });

  it("lets the owner read their sermon and hides it from others", async () => {
    const own = await alice.client.from("sermons").select("id,title").eq("id", sermonId);
    expect(own.data).toHaveLength(1);
    const other = await bob.client.from("sermons").select("id").eq("id", sermonId);
    expect(other.error).toBeNull();
    expect(other.data).toHaveLength(0);
    const anon = await anonClient().from("sermons").select("id");
    expect(anon.data ?? []).toHaveLength(0);
  });

  it("prevents other users from updating or deleting a sermon", async () => {
    const upd = await bob.client.from("sermons").update({ title: "hijacked" }).eq("id", sermonId).select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await bob.client.from("sermons").delete().eq("id", sermonId).select();
    expect(del.data ?? []).toHaveLength(0);
    const check = await alice.client.from("sermons").select("title").eq("id", sermonId).single();
    expect(check.data?.title).toBe("Faith in the Waiting");
  });

  it("prevents attaching captures to someone else's sermon", async () => {
    const res = await bob.client.from("sermon_moments").insert({
      sermon_id: sermonId,
      category: "BOOKMARK",
      origin: "user",
      timestamp_source: "user_capture",
    });
    expect(res.error).not.toBeNull();
  });

  it("allows the owner to add user captures but not AI-origin rows", async () => {
    const ok = await alice.client
      .from("sermon_moments")
      .insert({ sermon_id: sermonId, category: "BOOKMARK", origin: "user", timestamp_source: "user_capture", timestamp_start: 42 })
      .select()
      .single();
    expect(ok.error).toBeNull();
    const forged = await alice.client
      .from("sermon_moments")
      .insert({ sermon_id: sermonId, category: "MAIN_POINT", origin: "ai" });
    expect(forged.error).not.toBeNull();
  });

  it("keeps system tables read-only for users", async () => {
    const job = await alice.client.from("jobs").insert({ user_id: alice.id, type: "BUILD_SERMON_PACK" } as never);
    expect(job.error).not.toBeNull();
    const art = await alice.client
      .from("ai_artifacts")
      .insert({ user_id: alice.id, type: "SERMON_PACK", provider: "x", model: "y", prompt_version: "z" } as never);
    expect(art.error).not.toBeNull();
    const cite = await alice.client.from("source_citations").insert({} as never);
    expect(cite.error).not.toBeNull();
  });

  it("does not let users forge provenance columns on AI items", async () => {
    const [idea] = await sql()`
      insert into public.main_ideas (sermon_id, user_id, title, origin)
      values (${sermonId}, ${alice.id}, 'Waiting is active trust', 'ai') returning id`;
    const edit = await alice.client.from("main_ideas").update({ title: "Waiting is trust", user_edited: true }).eq("id", idea!.id).select();
    expect(edit.error).toBeNull();
    expect(edit.data?.[0]?.title).toBe("Waiting is trust");
    const forge = await alice.client.from("main_ideas").update({ origin: "user" } as never).eq("id", idea!.id);
    expect(forge.error).not.toBeNull();
    const bobEdit = await bob.client.from("main_ideas").update({ title: "nope" }).eq("id", idea!.id).select();
    expect(bobEdit.data ?? []).toHaveLength(0);
  });

  it("saves notes with optimistic concurrency and derives blocks", async () => {
    const content = { type: "doc", content: [{ type: "paragraph", attrs: { id: "b1" }, content: [{ type: "text", text: "Hello" }] }] };
    const blocks = [{ block_id: "b1", position: 0, block_type: "paragraph", text: "Hello", timestamp_seconds: null, content_hash: "h1" }];
    const first = await alice.client.rpc("save_note", {
      p_note_id: noteId,
      p_base_version: 1,
      p_title: "Notes",
      p_content: content,
      p_plain_text: "Hello",
      p_content_hash: "hash-1",
      p_blocks: blocks,
      p_client_updated_at: new Date().toISOString(),
    });
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toEqual({ status: "saved", version: 2 });

    const stale = await alice.client.rpc("save_note", {
      p_note_id: noteId,
      p_base_version: 1,
      p_title: "Notes",
      p_content: content,
      p_plain_text: "Hello again",
      p_content_hash: "hash-2",
      p_blocks: blocks,
      p_client_updated_at: new Date().toISOString(),
    });
    expect(stale.data?.[0]).toEqual({ status: "conflict", version: 2 });

    const nb = await alice.client.from("note_blocks").select("block_id,text").eq("note_id", noteId);
    expect(nb.data).toEqual([{ block_id: "b1", text: "Hello" }]);

    const bobSave = await bob.client.rpc("save_note", {
      p_note_id: noteId,
      p_base_version: 2,
      p_title: "x",
      p_content: content,
      p_plain_text: "x",
      p_content_hash: "x",
      p_blocks: [],
      p_client_updated_at: new Date().toISOString(),
    });
    expect(bobSave.error).not.toBeNull();
    const bobNote = await bob.client.rpc("create_note", { p_sermon_id: sermonId, p_title: "x" });
    expect(bobNote.error).not.toBeNull();
  });

  it("isolates storage objects by user folder", async () => {
    const path = `${alice.id}/${sermonId}/test/photo.png`;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const up = await alice.client.storage.from("photos").upload(path, png, { contentType: "image/png" });
    expect(up.error).toBeNull();
    const bobRead = await bob.client.storage.from("photos").download(path);
    expect(bobRead.error).not.toBeNull();
    const bobWrite = await bob.client.storage
      .from("photos")
      .upload(`${alice.id}/${sermonId}/evil.png`, png, { contentType: "image/png" });
    expect(bobWrite.error).not.toBeNull();
    const wrongType = await alice.client.storage
      .from("photos")
      .upload(`${alice.id}/${sermonId}/x.exe`, png, { contentType: "application/x-msdownload" });
    expect(wrongType.error).not.toBeNull();
    const derived = await alice.client.storage
      .from("derived")
      .upload(`${alice.id}/${sermonId}/p.webp`, png, { contentType: "image/webp" });
    expect(derived.error).not.toBeNull();
    const cleanup = await alice.client.storage.from("photos").remove([path]);
    expect(cleanup.error).toBeNull();
  });

  it("scopes search and retrieval functions to the caller", async () => {
    const mine = await alice.client.rpc("search_library", { p_query: "waiting" });
    expect(mine.error).toBeNull();
    expect(mine.data?.map((r) => r.sermon_id)).toContain(sermonId);
    const theirs = await bob.client.rpc("search_library", { p_query: "waiting" });
    expect(theirs.data ?? []).toHaveLength(0);
    const chunks = await bob.client.rpc("match_source_chunks", { p_sermon_id: sermonId, p_query_text: "hello" });
    expect(chunks.data ?? []).toHaveLength(0);
  });

  it("enforces rate limits per user", async () => {
    const calls = await Promise.all(
      [1, 2, 3].map(() => alice.client.rpc("consume_rate_limit", { p_bucket: "test", p_limit: 2, p_window_seconds: 60 })),
    );
    const allowed = calls.filter((c) => c.data === true).length;
    expect(allowed).toBe(2);
  });

  it("cascades deletes from sermons to children", async () => {
    const del = await alice.client.from("sermons").delete().eq("id", sermonId).select();
    expect(del.data).toHaveLength(1);
    const [row] = await sql()`select count(*)::int as n from public.sermon_sources where sermon_id = ${sermonId}`;
    expect(row!.n).toBe(0);
  });
});
