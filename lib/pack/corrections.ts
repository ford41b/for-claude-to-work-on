import { z } from "zod";
import { normalizeReference } from "@/lib/bible/reference";
import { AppError, notFound } from "@/lib/http/errors";
import { maybeScheduleSynthesis } from "@/lib/jobs/pipeline";
import type { ServiceContext } from "@/lib/sermons/service";
import type { TableUpdate } from "@/lib/supabase/types";

/**
 * User corrections to generated items. Every correction marks the row user_edited so
 * regeneration never overwrites it.
 */

export const momentCorrectionSchema = z.object({
  timestampStart: z.number().min(0).max(24 * 3600).nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  verified: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export async function correctMoment(ctx: ServiceContext, id: string, input: z.infer<typeof momentCorrectionSchema>) {
  const { data: m, error } = await ctx.supabase
    .from("sermon_moments")
    .select("id, timestamp_start, original_timestamp_start, timestamp_source")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!m) throw notFound("That moment");
  const patch: TableUpdate<"sermon_moments"> = { user_edited: true };
  if (input.timestampStart !== undefined) {
    patch.timestamp_start = input.timestampStart;
    patch.timestamp_source = "user_correction";
    patch.verification_status = "user_corrected";
    if (m.original_timestamp_start === null && m.timestamp_source === "ai") patch.original_timestamp_start = m.timestamp_start;
  } else if (input.verified) {
    patch.verification_status = "user_verified";
  }
  if (input.title !== undefined) patch.title = input.title;
  if (input.hidden !== undefined) patch.hidden = input.hidden;
  const { error: upErr } = await ctx.supabase.from("sermon_moments").update(patch).eq("id", id);
  if (upErr) throw upErr;
}

export const PACK_ITEM_TABLES = {
  main_ideas: ["title", "summary", "explanation", "hidden"],
  sermon_sections: ["title", "summary", "hidden"],
  quotes: ["hidden"],
  illustrations: ["title", "summary", "hidden"],
  terms: ["definition", "hidden"],
} as const;
export type PackItemTable = keyof typeof PACK_ITEM_TABLES;

export const packItemCorrectionSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  summary: z.string().trim().max(2000).optional(),
  explanation: z.string().trim().max(4000).optional(),
  definition: z.string().trim().max(2000).optional(),
  hidden: z.boolean().optional(),
});

export async function correctPackItem(ctx: ServiceContext, table: PackItemTable, id: string, input: z.infer<typeof packItemCorrectionSchema>) {
  const allowed = PACK_ITEM_TABLES[table] as readonly string[];
  const patch: Record<string, unknown> = { user_edited: true };
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (!allowed.includes(k)) throw new AppError("validation", `"${k}" can't be edited on this item.`);
    patch[k] = v;
  }
  const { data, error } = await ctx.supabase.from(table).update(patch as never).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw notFound("That item");
}

export const scriptureCorrectionSchema = z.object({
  reference: z.string().trim().min(2).max(200).optional(),
  timestampStart: z.number().min(0).max(24 * 3600).nullable().optional(),
  hidden: z.boolean().optional(),
});

export async function correctScripture(ctx: ServiceContext, id: string, input: z.infer<typeof scriptureCorrectionSchema>) {
  const patch: TableUpdate<"scripture_references"> = { user_edited: true };
  if (input.reference !== undefined) {
    const parsed = normalizeReference(input.reference);
    if (!parsed) throw new AppError("validation", "That doesn't look like a valid Bible reference (for example, John 3:16).");
    Object.assign(patch, {
      reference_text: input.reference,
      normalized_reference: parsed.normalized,
      osis: parsed.osis,
      book: parsed.book,
      chapter_start: parsed.chapterStart,
      verse_start: parsed.verseStart,
      chapter_end: parsed.chapterEnd,
      verse_end: parsed.verseEnd,
    });
  }
  if (input.timestampStart !== undefined) patch.timestamp_start = input.timestampStart;
  if (input.hidden !== undefined) patch.hidden = input.hidden;
  const { data, error } = await ctx.supabase.from("scripture_references").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw notFound("That reference");
}

export const addScriptureSchema = z.object({
  reference: z.string().trim().min(2).max(200),
  clientId: z.uuid().optional(),
  timestampStart: z.number().min(0).max(24 * 3600).nullable().optional(),
});

export async function addScripture(ctx: ServiceContext, sermonId: string, input: z.infer<typeof addScriptureSchema>) {
  const parsed = normalizeReference(input.reference);
  if (!parsed) throw new AppError("validation", "That doesn't look like a valid Bible reference (for example, John 3:16).");
  const { data, error } = await ctx.supabase
    .from("scripture_references")
    .upsert(
      {
        sermon_id: sermonId,
        origin: "user",
        reference_text: input.reference,
        normalized_reference: parsed.normalized,
        osis: parsed.osis,
        book: parsed.book,
        chapter_start: parsed.chapterStart,
        verse_start: parsed.verseStart,
        chapter_end: parsed.chapterEnd,
        verse_end: parsed.verseEnd,
        kind: parsed.kind === "allusion" ? "allusion" : "explicit",
        confidence: "high",
        role: "mentioned",
        timestamp_start: input.timestampStart ?? null,
        client_id: input.clientId ?? null,
      },
      { onConflict: "client_id", ignoreDuplicates: true },
    )
    .select("id, normalized_reference");
  if (error) {
    if (error.code === "42501") throw notFound("That sermon");
    throw error;
  }
  return { normalized: parsed.normalized, osis: parsed.osis, id: data?.[0]?.id ?? null };
}

export const ocrCorrectionSchema = z.object({ text: z.string().max(20000) });

/** Saves the user's transcription as the authoritative, current OCR version. */
export async function correctOcr(ctx: ServiceContext, photoSourceId: string, input: z.infer<typeof ocrCorrectionSchema>) {
  const { data: photo, error } = await ctx.supabase.from("photos").select("source_id, sermon_id, current_ocr_id").eq("source_id", photoSourceId).maybeSingle();
  if (error) throw error;
  if (!photo) throw notFound("That photo");
  const blocks = input.text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ type: text.startsWith("•") ? "list_item" : "paragraph", text: text.replace(/^•\s*/, ""), confidence: "high", unclear: false }));
  await ctx.sql.begin(async (tx) => {
    const [prev] = await tx<{ photo_kind: string | null; title: string | null }[]>`
      select photo_kind, title from public.ocr_extractions where id = ${photo.current_ocr_id}`;
    const [v] = await tx<{ next: number }[]>`
      select coalesce(max(version), 0) + 1 as next from public.ocr_extractions where photo_source_id = ${photoSourceId}`;
    await tx`update public.ocr_extractions set is_current = false where photo_source_id = ${photoSourceId} and is_current`;
    const [row] = await tx<{ id: string }[]>`
      insert into public.ocr_extractions (photo_source_id, sermon_id, user_id, version, origin, is_current, photo_kind, title, full_text, blocks, overall_confidence)
      values (${photoSourceId}, ${photo.sermon_id}, ${ctx.userId}, ${v!.next}, 'user', true, ${prev?.photo_kind ?? null}, null,
              ${input.text}, ${tx.json(blocks as never)}, 'high')
      returning id`;
    await tx`update public.photos set current_ocr_id = ${row!.id} where source_id = ${photoSourceId}`;
    await tx`
      update public.sermon_sources set status = 'processed', error_code = null, error_message = null
      where id = ${photoSourceId} and user_id = ${ctx.userId}`;
    await tx`update public.sermons set pack_stale = true where id = ${photo.sermon_id} and current_pack_id is not null`;
  });
  await maybeScheduleSynthesis(ctx.sql, photo.sermon_id, { delaySeconds: 120 });
}
