import { z } from "zod";
import type { Database } from "@/types/database";
import type { Sql } from "@/lib/db/admin";
import { AppError, notFound } from "@/lib/http/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { enqueueSourceJob, maybeScheduleSynthesis } from "@/lib/jobs/pipeline";
import { removeObjects, type Bucket } from "@/lib/storage/objects";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { parseYouTubeUrl, YOUTUBE_PARSE_MESSAGES } from "@/lib/youtube/parse";
import { youtubeThumbnailFallback } from "@/lib/youtube/metadata";

export interface ServiceContext {
  supabase: AppSupabaseClient;
  userId: string;
  sql: Sql;
}

/** Verifies ownership through RLS (the user-scoped client can only see its own rows). */
export async function assertOwnsSermon(ctx: ServiceContext, sermonId: string) {
  const { data, error } = await ctx.supabase.from("sermons").select("id, status, title").eq("id", sermonId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("That sermon");
  return data;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createSermonSchema = z.object({
  title: optionalText(300),
  speaker: optionalText(200),
  church: optionalText(200),
  series: optionalText(200),
  preachedOn: z.iso.date().optional(),
  youtubeUrl: optionalText(2048),
});
export type CreateSermonInput = z.input<typeof createSermonSchema>;

export async function createSermon(ctx: ServiceContext, raw: CreateSermonInput) {
  const input = createSermonSchema.parse(raw);
  let parsedUrl: ReturnType<typeof parseYouTubeUrl> | null = null;
  if (input.youtubeUrl) {
    parsedUrl = parseYouTubeUrl(input.youtubeUrl);
    if (!parsedUrl.ok) throw new AppError("validation", YOUTUBE_PARSE_MESSAGES[parsedUrl.error], { data: { field: "youtubeUrl" } });
  }
  const corrected = (["title", "speaker", "church", "series"] as const).filter((k) => input[k]);
  const { data: sermon, error } = await ctx.supabase
    .from("sermons")
    .insert({
      title: input.title ?? "",
      speaker: input.speaker ?? null,
      church: input.church ?? null,
      series: input.series ?? null,
      preached_on: input.preachedOn ?? null,
      corrected_fields: [...corrected, ...(input.preachedOn ? ["preached_on"] : [])],
    })
    .select("id")
    .single();
  if (error) throw error;
  const note = await ctx.supabase.rpc("create_note", { p_sermon_id: sermon.id, p_title: "Notes" });
  if (note.error) throw note.error;
  if (parsedUrl?.ok) await attachYouTube(ctx, sermon.id, parsedUrl.value.canonicalUrl);
  return { id: sermon.id, noteId: note.data.id };
}

export async function attachYouTube(ctx: ServiceContext, sermonId: string, url: string) {
  await assertOwnsSermon(ctx, sermonId);
  const parsed = parseYouTubeUrl(url);
  if (!parsed.ok) throw new AppError("validation", YOUTUBE_PARSE_MESSAGES[parsed.error], { data: { field: "youtubeUrl" } });
  const { videoId, canonicalUrl } = parsed.value;

  const sourceId = await ctx.sql.begin(async (tx) => {
    await tx`select 1 from public.sermons where id = ${sermonId} and user_id = ${ctx.userId} for update`;
    const [existing] = await tx<{ id: string; youtube_video_id: string | null }[]>`
      select s.id, v.youtube_video_id from public.sermon_sources s
      join public.video_sources v on v.source_id = s.id
      where s.sermon_id = ${sermonId} and s.source_type = 'SERMON_VIDEO'`;
    if (existing?.youtube_video_id === videoId) return existing.id;
    // One linked YouTube video per notebook: replacing it removes the old analysis too.
    if (existing) await tx`delete from public.sermon_sources where id = ${existing.id}`;
    const [src] = await tx<{ id: string }[]>`
      insert into public.sermon_sources (sermon_id, user_id, source_type, label, ordinal, status)
      values (${sermonId}, ${ctx.userId}, 'SERMON_VIDEO', 'Sermon video', 1, 'processing')
      returning id`;
    await tx`
      insert into public.video_sources (source_id, sermon_id, user_id, origin, youtube_video_id, original_url, thumbnail_url)
      values (${src!.id}, ${sermonId}, ${ctx.userId}, 'youtube', ${videoId}, ${canonicalUrl}, ${youtubeThumbnailFallback(videoId)})`;
    return src!.id;
  });
  await enqueueSourceJob(ctx.sql, { id: sourceId, sermon_id: sermonId, user_id: ctx.userId, source_type: "SERMON_VIDEO" });
  return { sourceId, videoId };
}

export const updateSermonSchema = z
  .object({
    title: z.string().trim().max(300).optional(),
    speaker: z.string().trim().max(200).nullable().optional(),
    church: z.string().trim().max(200).nullable().optional(),
    series: z.string().trim().max(200).nullable().optional(),
    preachedOn: z.iso.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/** User corrections to metadata. Each corrected field becomes authoritative. */
export async function updateSermon(ctx: ServiceContext, sermonId: string, input: z.infer<typeof updateSermonSchema>) {
  const { data: current, error } = await ctx.supabase.from("sermons").select("corrected_fields").eq("id", sermonId).maybeSingle();
  if (error) throw error;
  if (!current) throw notFound("That sermon");
  const patch: Database["public"]["Tables"]["sermons"]["Update"] = {};
  const corrected = new Set(current.corrected_fields);
  const map = { title: "title", speaker: "speaker", church: "church", series: "series", preachedOn: "preached_on" } as const;
  for (const [key, column] of Object.entries(map) as [keyof typeof map, (typeof map)[keyof typeof map]][]) {
    if (input[key] === undefined) continue;
    const value = input[key];
    const normalized = typeof value === "string" ? value || (column === "title" ? "" : null) : value;
    Object.assign(patch, { [column]: normalized });
    corrected.add(column);
  }
  patch.corrected_fields = [...corrected];
  const { error: upErr } = await ctx.supabase.from("sermons").update(patch).eq("id", sermonId);
  if (upErr) throw upErr;
}

/** "Finish Sermon": marks the notebook finished and schedules everything still to do. */
export async function finishSermon(ctx: ServiceContext, sermonId: string) {
  await assertOwnsSermon(ctx, sermonId);
  await ctx.sql`
    update public.sermons set status = 'finished', finished_at = coalesce(finished_at, now())
    where id = ${sermonId} and user_id = ${ctx.userId}`;
  // Sources that couldn't run earlier (e.g. a livestream still in progress) get another chance.
  const retry = await ctx.sql<{ id: string; source_type: string }[]>`
    select id, source_type from public.sermon_sources
    where sermon_id = ${sermonId} and (status = 'ready' and error_code = 'live_in_progress' or status = 'failed')`;
  for (const s of retry) {
    await enqueueSourceJob(ctx.sql, { id: s.id, sermon_id: sermonId, user_id: ctx.userId, source_type: s.source_type });
  }
  await maybeScheduleSynthesis(ctx.sql, sermonId);
}

/** Regenerates the Sermon Pack (user edits are preserved by the persistence layer). */
export async function rebuildPack(ctx: ServiceContext, sermonId: string) {
  const sermon = await assertOwnsSermon(ctx, sermonId);
  if (sermon.status !== "finished") throw new AppError("conflict", "Finish the sermon first, then the Sermon Pack will be built.");
  await enqueueJob(ctx.sql, {
    userId: ctx.userId,
    sermonId,
    type: "EXTRACT_SCRIPTURE",
    dedupeKey: `scripture:${sermonId}`,
    payload: { force: true },
  });
}

export async function retrySource(ctx: ServiceContext, sourceId: string) {
  const { data: source, error } = await ctx.supabase
    .from("sermon_sources")
    .select("id, sermon_id, source_type, status")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!source) throw notFound("That source");
  await ctx.sql`update public.sermon_sources set status = 'processing', error_code = null, error_message = null where id = ${sourceId}`;
  await enqueueSourceJob(ctx.sql, { id: source.id, sermon_id: source.sermon_id, user_id: ctx.userId, source_type: source.source_type }, { force: true });
}

async function objectsForSermon(ctx: ServiceContext, sermonId: string, sourceId?: string) {
  let q = ctx.supabase.from("media_files").select("bucket, path").eq("sermon_id", sermonId);
  if (sourceId) q = q.eq("source_id", sourceId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((f) => ({ bucket: f.bucket as Bucket, path: f.path }));
}

/** Deletes a whole notebook: stored files first (via the Storage API), then rows (cascade). */
export async function deleteSermon(ctx: ServiceContext, sermonId: string) {
  await assertOwnsSermon(ctx, sermonId);
  await removeObjects(await objectsForSermon(ctx, sermonId));
  const { error } = await ctx.supabase.from("sermons").delete().eq("id", sermonId);
  if (error) throw error;
}

/** Deletes one piece of evidence (photo, recording, document) and its files. Notes are kept. */
export async function deleteSource(ctx: ServiceContext, sourceId: string) {
  const { data: source, error } = await ctx.supabase
    .from("sermon_sources")
    .select("id, sermon_id, source_type")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!source) throw notFound("That source");
  if (source.source_type === "USER_NOTE") throw new AppError("validation", "Notes can be cleared in the editor but not deleted here.");
  await removeObjects(await objectsForSermon(ctx, source.sermon_id, sourceId));
  await ctx.sql`delete from public.sermon_sources where id = ${sourceId} and user_id = ${ctx.userId}`;
  await ctx.sql`update public.sermons set pack_stale = true where id = ${source.sermon_id} and current_pack_id is not null`;
  await maybeScheduleSynthesis(ctx.sql, source.sermon_id, { delaySeconds: 60 });
}
