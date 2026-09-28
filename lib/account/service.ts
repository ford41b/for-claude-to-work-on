import { AppError } from "@/lib/http/errors";
import { removeAllUserObjects, signedReadUrl, type Bucket } from "@/lib/storage/objects";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ServiceContext } from "@/lib/sermons/service";

const EXPORT_TABLES = [
  "profiles", "user_settings", "sermons", "sermon_sources", "media_files", "video_sources", "audio_sources", "photos",
  "ocr_extractions", "documents", "notes", "note_blocks", "main_ideas", "sermon_sections", "sermon_moments",
  "scripture_references", "quotes", "illustrations", "applications", "questions", "terms", "review_items",
  "source_citations", "study_guides", "chat_threads", "chat_messages", "ai_artifacts",
] as const;

/** Portable JSON export of everything the user owns, plus 24-hour links to their files. */
export async function exportAccount(ctx: ServiceContext) {
  const data: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await ctx.supabase.from(table).select("*").range(from, from + 999);
      if (error) throw error;
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    data[table] = rows;
  }
  const files = await Promise.all(
    (data.media_files as { bucket: string; path: string; kind: string; original_filename: string | null; status: string }[])
      .filter((f) => f.status === "verified")
      .map(async (f) => ({
        kind: f.kind,
        filename: f.original_filename,
        path: f.path,
        url: await signedReadUrl(f.bucket as Bucket, f.path, 24 * 3600).catch(() => null),
      })),
  );
  return {
    exported_at: new Date().toISOString(),
    format: "sermon-notebook-export/v1",
    note: "Notes are ProseMirror JSON (see notes.content) with plain text in notes.plain_text. File links expire after 24 hours.",
    data,
    files,
  };
}

/** Permanently deletes the account: every stored file, then the auth user (rows cascade). */
export async function deleteAccount(ctx: ServiceContext, confirmation: string) {
  if (confirmation !== "DELETE") throw new AppError("validation", 'Type DELETE to confirm.');
  await removeAllUserObjects(ctx.userId);
  const { error } = await supabaseAdmin().auth.admin.deleteUser(ctx.userId);
  if (error) throw new AppError("internal", "The account couldn't be deleted. Please try again.", { detail: error.message });
}
