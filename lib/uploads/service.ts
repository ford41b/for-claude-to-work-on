import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { ALLOWED_MIME, BUCKET_FOR_KIND, UPLOAD_LIMITS, type UploadKind } from "@/lib/config/app";
import { AppError, notFound } from "@/lib/http/errors";
import { enqueueSourceJob } from "@/lib/jobs/pipeline";
import { objectPath, readHead, removeObjects, type Bucket } from "@/lib/storage/objects";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertOwnsSermon, type ServiceContext } from "@/lib/sermons/service";

/**
 * Upload flow:
 *  1) requestUpload — validates kind/type/size, reserves rows, returns a signed upload target
 *     at a server-chosen path (<user>/<sermon>/<file>/<name>).
 *  2) the browser uploads directly to Storage (signed URL, or resumable TUS for recordings).
 *  3) completeUpload — sniffs the real file type from its first bytes, checks the size, and
 *     only then marks it verified and starts processing. Mismatches are deleted.
 */

export const requestUploadSchema = z.object({
  sermonId: z.uuid(),
  kind: z.enum(["photo", "audio", "video", "document"]),
  mimeType: z.string().trim().toLowerCase().max(100),
  sizeBytes: z.number().int().positive(),
  filename: z.string().trim().min(1).max(255),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  sermonTimestampSeconds: z.number().min(0).max(24 * 3600).optional(),
  rightsConfirmed: z.boolean().optional(),
});
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export interface UploadTarget {
  mediaFileId: string;
  sourceId: string;
  bucket: Bucket;
  path: string;
  method: "signed" | "tus";
  token?: string;
}

const SOURCE_TYPE: Record<UploadKind, "PHOTO" | "UPLOADED_AUDIO" | "UPLOADED_VIDEO" | "DOCUMENT"> = {
  photo: "PHOTO",
  audio: "UPLOADED_AUDIO",
  video: "UPLOADED_VIDEO",
  document: "DOCUMENT",
};

const LABEL: Record<UploadKind, (n: number) => string> = {
  photo: (n) => `Photo ${n}`,
  audio: (n) => (n === 1 ? "Uploaded recording" : `Uploaded recording ${n}`),
  video: (n) => (n === 1 ? "Uploaded video" : `Uploaded video ${n}`),
  document: (n) => `Document ${n}`,
};

function readableSize(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(0)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

export async function requestUpload(ctx: ServiceContext, input: RequestUploadInput): Promise<UploadTarget> {
  await assertOwnsSermon(ctx, input.sermonId);
  const allowed = ALLOWED_MIME[input.kind] as readonly string[];
  if (!allowed.includes(input.mimeType)) {
    throw new AppError("unsupported_media", `That file type isn't supported for ${input.kind === "document" ? "documents" : `${input.kind}s`}.`);
  }
  const limit = UPLOAD_LIMITS[input.kind];
  if (input.sizeBytes > limit) throw new AppError("payload_too_large", `That file is larger than the ${readableSize(limit)} limit.`);
  if ((input.kind === "audio" || input.kind === "video") && !input.rightsConfirmed) {
    throw new AppError("validation", "Please confirm you have permission to upload and process this recording.");
  }

  const kind = input.kind;
  const bucket = BUCKET_FOR_KIND[kind];
  const mediaFileId = randomUUID();
  const path = objectPath(ctx.userId, input.sermonId, mediaFileId, input.filename);
  const sourceType = SOURCE_TYPE[kind];

  const sourceId = await ctx.sql.begin(async (tx) => {
    await tx`select 1 from public.sermons where id = ${input.sermonId} and user_id = ${ctx.userId} for update`;
    const [{ n }] = (await tx<{ n: number }[]>`
      select coalesce(max(ordinal), 0) + 1 as n from public.sermon_sources
      where sermon_id = ${input.sermonId} and source_type = ${sourceType}`) as unknown as [{ n: number }];
    const [src] = await tx<{ id: string }[]>`
      insert into public.sermon_sources (sermon_id, user_id, source_type, label, ordinal, status)
      values (${input.sermonId}, ${ctx.userId}, ${sourceType}, ${LABEL[kind](n)}, ${n}, 'pending_upload')
      returning id`;
    const mediaKind = kind === "photo" ? "photo" : kind;
    await tx`
      insert into public.media_files (id, sermon_id, user_id, source_id, kind, bucket, path, mime_type, size_bytes, sha256,
                                      original_filename, status, rights_confirmed_at)
      values (${mediaFileId}, ${input.sermonId}, ${ctx.userId}, ${src!.id}, ${mediaKind}, ${bucket}, ${path}, ${input.mimeType},
              ${input.sizeBytes}, ${input.sha256 ?? null}, ${input.filename}, 'pending',
              ${kind === "audio" || kind === "video" ? new Date() : null})`;
    if (kind === "photo") {
      await tx`
        insert into public.photos (source_id, sermon_id, user_id, original_file_id, captured_at, sermon_timestamp_seconds)
        values (${src!.id}, ${input.sermonId}, ${ctx.userId}, ${mediaFileId}, ${input.capturedAt ?? null},
                ${input.sermonTimestampSeconds ?? null})`;
    } else if (kind === "audio") {
      await tx`insert into public.audio_sources (source_id, sermon_id, user_id, media_file_id) values (${src!.id}, ${input.sermonId}, ${ctx.userId}, ${mediaFileId})`;
    } else if (kind === "video") {
      await tx`
        insert into public.video_sources (source_id, sermon_id, user_id, origin, media_file_id, title)
        values (${src!.id}, ${input.sermonId}, ${ctx.userId}, 'upload', ${mediaFileId}, ${input.filename})`;
    } else {
      await tx`
        insert into public.documents (source_id, sermon_id, user_id, media_file_id, title)
        values (${src!.id}, ${input.sermonId}, ${ctx.userId}, ${mediaFileId}, ${input.filename.replace(/\.[a-z0-9]+$/i, "")})`;
    }
    return src!.id;
  });

  if (kind === "audio" || kind === "video") {
    // Large recordings use resumable (TUS) uploads with the user's session; storage RLS limits
    // writes to the user's own folder and the server verifies the exact path afterwards.
    return { mediaFileId, sourceId, bucket, path, method: "tus" };
  }
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new AppError("internal", "Couldn't prepare the upload. Please try again.", { detail: error?.message });
  return { mediaFileId, sourceId, bucket, path, method: "signed", token: data.token };
}

function familyOf(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  return mime.split("/")[0] ?? "";
}

function looksLikeText(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length === 4100 ? head.slice(0, 4000) : head);
    return true;
  } catch {
    return false;
  }
}

/** Verifies an uploaded object and starts processing. */
export async function completeUpload(ctx: ServiceContext, mediaFileId: string) {
  const { data: file, error } = await ctx.supabase
    .from("media_files")
    .select("id, sermon_id, source_id, kind, bucket, path, mime_type, size_bytes, status")
    .eq("id", mediaFileId)
    .maybeSingle();
  if (error) throw error;
  if (!file || !file.source_id) throw notFound("That upload");
  if (file.status === "verified") return { status: "verified" as const };

  const reject = async (reason: string, message: string) => {
    await removeObjects([{ bucket: file.bucket as Bucket, path: file.path }]).catch(() => {});
    await ctx.sql`update public.media_files set status = 'rejected', rejection_reason = ${reason} where id = ${mediaFileId}`;
    await ctx.sql`
      update public.sermon_sources set status = 'failed', error_code = ${reason}, error_message = ${message}
      where id = ${file.source_id}`;
    throw new AppError("unsupported_media", message);
  };

  let head: Uint8Array;
  let size: number | null;
  try {
    ({ head, size } = await readHead(file.bucket as Bucket, file.path));
  } catch {
    throw new AppError("conflict", "The upload hasn't arrived yet. Please try again in a moment.");
  }
  const kind = file.kind as UploadKind;
  const limit = UPLOAD_LIMITS[kind === "photo" ? "photo" : kind];
  if (size !== null && size > limit) return reject("too_large", "That file is larger than allowed.");

  const detected = await fileTypeFromBuffer(head);
  let mime = file.mime_type;
  if (kind === "document" && (file.mime_type === "text/plain" || file.mime_type === "text/markdown")) {
    if (detected || !looksLikeText(head)) return reject("type_mismatch", "That file doesn't look like plain text.");
  } else {
    if (!detected) return reject("type_unknown", "We couldn't recognize that file's type. Please upload a supported format.");
    const expected = kind === "photo" ? "image" : kind === "document" ? "pdf" : kind;
    const family = familyOf(detected.mime);
    // Audio is often packaged in an MP4 container (M4A); accept video/mp4 for audio uploads.
    const ok = family === expected || (kind === "audio" && detected.mime === "video/mp4");
    if (!ok) return reject("type_mismatch", "That file's contents don't match its type. Please upload the original file.");
    mime = detected.mime === "audio/x-m4a" ? "audio/mp4" : detected.mime;
  }

  await ctx.sql`
    update public.media_files
       set status = 'verified', verified_at = now(), mime_type = ${mime}, size_bytes = coalesce(${size}, size_bytes)
     where id = ${mediaFileId}`;
  await ctx.sql`update public.sermon_sources set status = 'processing', error_code = null, error_message = null where id = ${file.source_id}`;
  const sourceType = kind === "photo" ? "PHOTO" : kind === "audio" ? "UPLOADED_AUDIO" : kind === "video" ? "UPLOADED_VIDEO" : "DOCUMENT";
  await enqueueSourceJob(ctx.sql, { id: file.source_id, sermon_id: file.sermon_id, user_id: ctx.userId, source_type: sourceType });
  return { status: "verified" as const };
}
