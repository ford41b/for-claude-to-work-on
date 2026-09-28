"use client";

import * as tus from "tus-js-client";
import { api } from "@/lib/client/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Browser side of the upload flow: request a target, upload directly to storage, confirm. */

export type UploadKind = "photo" | "audio" | "video" | "document";

interface UploadTarget {
  mediaFileId: string;
  sourceId: string;
  bucket: string;
  path: string;
  method: "signed" | "tus";
  token?: string;
}

export interface UploadOptions {
  sermonId: string;
  kind: UploadKind;
  file: Blob;
  filename: string;
  mimeType: string;
  capturedAt?: string;
  sermonTimestampSeconds?: number | null;
  rightsConfirmed?: boolean;
  onProgress?: (fraction: number) => void;
}

export async function uploadFile(opts: UploadOptions): Promise<{ sourceId: string }> {
  const target = await api<UploadTarget>("/api/uploads", {
    body: {
      sermonId: opts.sermonId,
      kind: opts.kind,
      mimeType: opts.mimeType,
      sizeBytes: opts.file.size,
      filename: opts.filename,
      capturedAt: opts.capturedAt,
      sermonTimestampSeconds: opts.sermonTimestampSeconds ?? undefined,
      rightsConfirmed: opts.rightsConfirmed,
    },
  });
  const supabase = getSupabaseBrowserClient();
  if (target.method === "signed") {
    const { error } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token!, opts.file, { contentType: opts.mimeType });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    opts.onProgress?.(1);
  } else {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again to upload.");
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(opts.file, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
        headers: {
          authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "x-upsert": "false",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024, // Supabase requires 6 MB chunks for resumable uploads.
        metadata: { bucketName: target.bucket, objectName: target.path, contentType: opts.mimeType, cacheControl: "3600" },
        onError: (err) => reject(err),
        onProgress: (sent, total) => opts.onProgress?.(total ? sent / total : 0),
        onSuccess: () => resolve(),
      });
      upload.findPreviousUploads().then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }, reject);
    });
  }
  await api(`/api/uploads/${target.mediaFileId}/complete`, { method: "POST" });
  return { sourceId: target.sourceId };
}

export function kindForFile(file: File): UploadKind | null {
  const t = file.type;
  if (t.startsWith("image/")) return "photo";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t === "application/pdf" || t === "text/plain" || t === "text/markdown") return "document";
  if (/\.(md|markdown)$/i.test(file.name)) return "document";
  if (/\.(heic|heif)$/i.test(file.name)) return "photo";
  return null;
}

export function mimeForFile(file: File): string {
  if (file.type) return file.type === "audio/x-m4a" ? "audio/mp4" : file.type;
  if (/\.(heic)$/i.test(file.name)) return "image/heic";
  if (/\.(heif)$/i.test(file.name)) return "image/heif";
  if (/\.(md|markdown)$/i.test(file.name)) return "text/markdown";
  return "application/octet-stream";
}
