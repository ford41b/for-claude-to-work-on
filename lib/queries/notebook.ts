import "server-only";
import { notFound } from "next/navigation";
import { signedReadUrl, type Bucket } from "@/lib/storage/objects";
import type { AppSupabaseClient, Enums, Tables } from "@/lib/supabase/types";

/**
 * Read models for notebook pages. All reads go through the user-scoped client (RLS). Signed
 * URLs for private media are minted server-side only after the row was readable by the user.
 */

export type SourceType = Enums<"source_type">;

export interface CitationView {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  sourceLabel: string;
  sourceKey: string | null;
  subjectPart: string | null;
  noteBlockId: string | null;
  timestampStart: number | null;
  timestampEnd: number | null;
  page: number | null;
  excerpt: string | null;
  confidence: Enums<"confidence_level"> | null;
}

export interface NotebookHeader {
  sermon: Tables<"sermons">;
  video: (Tables<"video_sources"> & { source: Pick<Tables<"sermon_sources">, "id" | "status" | "error_code" | "error_message" | "source_type"> }) | null;
  audio: (Tables<"audio_sources"> & { source: Pick<Tables<"sermon_sources">, "id" | "status" | "error_code" | "error_message" | "source_type"> }) | null;
  primaryNoteId: string | null;
}

export async function getNotebookHeader(supabase: AppSupabaseClient, sermonId: string): Promise<NotebookHeader> {
  const [sermon, videos, audios, notes] = await Promise.all([
    supabase.from("sermons").select("*").eq("id", sermonId).maybeSingle(),
    supabase
      .from("video_sources")
      .select("*, source:sermon_sources!inner(id, status, error_code, error_message, source_type, created_at)")
      .eq("sermon_id", sermonId),
    supabase
      .from("audio_sources")
      .select("*, source:sermon_sources!inner(id, status, error_code, error_message, source_type, created_at)")
      .eq("sermon_id", sermonId),
    supabase.from("notes").select("id").eq("sermon_id", sermonId).order("created_at").limit(1),
  ]);
  if (sermon.error) throw sermon.error;
  if (!sermon.data) notFound();
  // Prefer the linked YouTube video; otherwise the newest uploaded video.
  const videoRows = (videos.data ?? []) as NonNullable<NotebookHeader["video"]>[];
  const video = videoRows.find((v) => v.origin === "youtube") ?? videoRows.at(-1) ?? null;
  const audio = ((audios.data ?? []) as NonNullable<NotebookHeader["audio"]>[]).at(-1) ?? null;
  return { sermon: sermon.data, video, audio, primaryNoteId: notes.data?.[0]?.id ?? null };
}

export async function getCitations(supabase: AppSupabaseClient, sermonId: string): Promise<Map<string, CitationView[]>> {
  const [cites, sources] = await Promise.all([
    supabase
      .from("source_citations")
      .select("id, subject_type, subject_id, subject_part, source_id, source_key, note_block_id, timestamp_start, timestamp_end, page, excerpt, confidence, position")
      .eq("sermon_id", sermonId)
      .order("position"),
    supabase.from("sermon_sources").select("id, label, source_type").eq("sermon_id", sermonId),
  ]);
  if (cites.error) throw cites.error;
  const labels = new Map((sources.data ?? []).map((s) => [s.id, s]));
  const bySubject = new Map<string, CitationView[]>();
  for (const c of cites.data ?? []) {
    const src = labels.get(c.source_id);
    if (!src) continue;
    const key = `${c.subject_type}:${c.subject_id}`;
    const list = bySubject.get(key) ?? [];
    list.push({
      id: c.id,
      sourceId: c.source_id,
      sourceType: src.source_type,
      sourceLabel: src.label,
      sourceKey: c.source_key,
      subjectPart: c.subject_part,
      noteBlockId: c.note_block_id,
      timestampStart: c.timestamp_start,
      timestampEnd: c.timestamp_end,
      page: c.page,
      excerpt: c.excerpt,
      confidence: c.confidence,
    });
    bySubject.set(key, list);
  }
  return bySubject;
}

export function citationsFor(map: Map<string, CitationView[]>, subjectType: string, subjectId: string, part?: string): CitationView[] {
  const list = map.get(`${subjectType}:${subjectId}`) ?? [];
  return part ? list.filter((c) => c.subjectPart === part) : list;
}

export interface PhotoView {
  sourceId: string;
  ordinal: number;
  label: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  previewUrl: string | null;
  originalUrl: string | null;
  sermonTimestamp: number | null;
  capturedAt: string | null;
  ocr: Pick<Tables<"ocr_extractions">, "id" | "version" | "origin" | "photo_kind" | "title" | "full_text" | "blocks" | "overall_confidence" | "legibility_note"> | null;
}

export async function getPhotos(supabase: AppSupabaseClient, sermonId: string, options: { originals?: boolean } = {}): Promise<PhotoView[]> {
  const { data, error } = await supabase
    .from("photos")
    .select(
      "source_id, sermon_timestamp_seconds, captured_at, source:sermon_sources!inner(ordinal, label, status, error_code, error_message), original:media_files!photos_original_file_id_fkey(bucket, path, status), preview:media_files!photos_preview_file_id_fkey(bucket, path), ocr:ocr_extractions!photos_current_ocr_fk(id, version, origin, photo_kind, title, full_text, blocks, overall_confidence, legibility_note)",
    )
    .eq("sermon_id", sermonId);
  if (error) throw error;
  type Row = {
    source_id: string;
    sermon_timestamp_seconds: number | null;
    captured_at: string | null;
    source: { ordinal: number; label: string; status: string; error_code: string | null; error_message: string | null };
    original: { bucket: string; path: string; status: string } | null;
    preview: { bucket: string; path: string } | null;
    ocr: PhotoView["ocr"];
  };
  const rows = (data ?? []) as unknown as Row[];
  const views = await Promise.all(
    rows.map(async (r) => ({
      sourceId: r.source_id,
      ordinal: r.source.ordinal,
      label: r.source.label,
      status: r.source.status,
      errorCode: r.source.error_code,
      errorMessage: r.source.error_message,
      previewUrl: r.preview ? await signedReadUrl(r.preview.bucket as Bucket, r.preview.path).catch(() => null) : null,
      originalUrl:
        options.originals && r.original?.status === "verified"
          ? await signedReadUrl(r.original.bucket as Bucket, r.original.path).catch(() => null)
          : null,
      sermonTimestamp: r.sermon_timestamp_seconds,
      capturedAt: r.captured_at,
      ocr: r.ocr,
    })),
  );
  return views.sort((a, b) => a.ordinal - b.ordinal);
}

/** Preliminary timeline from the media analysis, shown before the Sermon Pack exists. */
export async function getPreliminaryAnalysis(supabase: AppSupabaseClient, sermonId: string) {
  const { data } = await supabase
    .from("ai_artifacts")
    .select("structured_content, source_id")
    .eq("sermon_id", sermonId)
    .in("type", ["VIDEO_ANALYSIS", "AUDIO_ANALYSIS"])
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.structured_content) return null;
  const c = data.structured_content as {
    is_sermon: boolean;
    content_note: string | null;
    duration_seconds: number | null;
    segments: { start: number; end: number; kind: string; summary: string }[];
  };
  return { sourceId: data.source_id, ...c };
}
