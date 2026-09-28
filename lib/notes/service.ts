import { z } from "zod";
import { hashJson, sha256 } from "@/lib/hash";
import { AppError, notFound } from "@/lib/http/errors";
import { maybeScheduleSynthesis, scheduleEmbeddings } from "@/lib/jobs/pipeline";
import type { ServiceContext } from "@/lib/sermons/service";
import { deriveBlocks, derivePlainText, pmDocSchema, type PMNode } from "./document";

export const saveNoteSchema = z.object({
  baseVersion: z.number().int().min(1),
  title: z.string().trim().max(200).default("Notes"),
  content: pmDocSchema,
  clientUpdatedAt: z.iso.datetime({ offset: true }).optional(),
});
export type SaveNoteInput = z.input<typeof saveNoteSchema>;

export type SaveNoteResult =
  | { status: "saved"; version: number }
  | { status: "conflict"; version: number; server: { title: string; content: PMNode; version: number } };

/**
 * Saves a note with optimistic concurrency. The server derives plain text and citable blocks
 * itself. On conflict nothing is overwritten: the caller receives the server copy and keeps the
 * local text as a separate "conflicted copy" note.
 */
export async function saveNote(ctx: ServiceContext, noteId: string, raw: SaveNoteInput): Promise<SaveNoteResult> {
  const input = saveNoteSchema.parse(raw);
  const doc = input.content as PMNode;
  const blocks = deriveBlocks(doc).map((b) => ({ ...b, content_hash: sha256(`${b.block_type}\n${b.text}\n${b.timestamp_seconds ?? ""}`) }));
  if (blocks.length > 5000) throw new AppError("payload_too_large", "This note is very long. Split it into a second note.");
  const plain = derivePlainText(doc);
  const contentHash = hashJson({ title: input.title, content: doc });

  const { data, error } = await ctx.supabase.rpc("save_note", {
    p_note_id: noteId,
    p_base_version: input.baseVersion,
    p_title: input.title,
    p_content: doc as never,
    p_plain_text: plain,
    p_content_hash: contentHash,
    p_blocks: blocks as never,
    p_client_updated_at: input.clientUpdatedAt ?? new Date().toISOString(),
  });
  if (error) {
    if (error.code === "P0002") throw notFound("That note");
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new AppError("internal", "The note couldn't be saved.");
  if (row.status === "conflict") {
    const { data: server } = await ctx.supabase.from("notes").select("title, content, version").eq("id", noteId).single();
    return { status: "conflict", version: row.version, server: { title: server!.title, content: server!.content as unknown as PMNode, version: server!.version } };
  }

  // After finishing, edits refresh search right away and the pack after a quiet period.
  const { data: note } = await ctx.supabase.from("notes").select("sermon_id, sermons(status)").eq("id", noteId).single();
  const sermonStatus = (note?.sermons as { status: string } | null)?.status;
  if (note && sermonStatus === "finished") {
    await scheduleEmbeddings(ctx.sql, ctx.userId, note.sermon_id, 30);
    await maybeScheduleSynthesis(ctx.sql, note.sermon_id, { delaySeconds: 180 });
  }
  return { status: "saved", version: row.version };
}

export const createNoteSchema = z.object({
  title: z.string().trim().max(200).default("Notes"),
  content: pmDocSchema.optional(),
});

export async function createNote(ctx: ServiceContext, sermonId: string, input: z.infer<typeof createNoteSchema>) {
  const { data, error } = await ctx.supabase.rpc("create_note", { p_sermon_id: sermonId, p_title: input.title });
  if (error) {
    if (error.code === "P0002") throw notFound("That sermon");
    throw error;
  }
  if (input.content) {
    const saved = await saveNote(ctx, data.id, { baseVersion: data.version, title: input.title, content: input.content });
    return { id: data.id, version: saved.version };
  }
  return { id: data.id, version: data.version };
}

export const captureSchema = z.object({
  clientId: z.uuid(),
  kind: z.enum(["BOOKMARK", "IMPORTANT", "QUESTION"]),
  text: z.string().trim().max(2000).default(""),
  timestampSeconds: z.number().min(0).max(24 * 3600).nullable().optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});

/** Sunday Mode captures. Idempotent by client id so offline replays never duplicate. */
export async function addCapture(ctx: ServiceContext, sermonId: string, input: z.infer<typeof captureSchema>) {
  const timestamp = input.timestampSeconds ?? null;
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  if (input.kind === "QUESTION" && !input.text) throw new AppError("validation", "Write the question first.");
  const title =
    input.text.slice(0, 300) || (input.kind === "BOOKMARK" ? "Bookmarked moment" : input.kind === "IMPORTANT" ? "Important moment" : "");
  const { error } = await ctx.supabase.from("sermon_moments").upsert(
    {
      sermon_id: sermonId,
      category: input.kind,
      origin: "user",
      title,
      description: input.text.length > 300 ? input.text : "",
      timestamp_start: timestamp,
      timestamp_source: "user_capture",
      verification_status: "user_verified",
      captured_at: capturedAt,
      client_id: input.clientId,
    },
    { onConflict: "client_id", ignoreDuplicates: true },
  );
  if (error) {
    if (error.code === "42501") throw notFound("That sermon");
    throw error;
  }
  if (input.kind === "QUESTION") {
    const { data: moment } = await ctx.supabase.from("sermon_moments").select("id").eq("client_id", input.clientId).single();
    const { error: qErr } = await ctx.supabase.from("questions").upsert(
      {
        sermon_id: sermonId,
        origin: "user",
        text: input.text,
        timestamp_seconds: timestamp,
        captured_at: capturedAt,
        moment_id: moment?.id ?? null,
        client_id: input.clientId,
      },
      { onConflict: "client_id", ignoreDuplicates: true },
    );
    if (qErr) throw qErr;
  }
  return { clientId: input.clientId };
}
