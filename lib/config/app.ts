export const APP_NAME = "Berean";
export const APP_DESCRIPTION = "Capture a sermon, your notes, and photos — and turn them into a study notebook you can trust.";

/** Upload limits (bytes). Buckets enforce matching caps server-side. */
export const UPLOAD_LIMITS = {
  photo: 30 * 1024 * 1024,
  audio: 500 * 1024 * 1024,
  video: 2 * 1024 * 1024 * 1024,
  document: 50 * 1024 * 1024,
} as const;

export const ALLOWED_MIME = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"],
  audio: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/wave", "audio/ogg", "audio/webm", "audio/flac"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/mpeg"],
  document: ["application/pdf", "text/plain", "text/markdown"],
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;

export const BUCKET_FOR_KIND: Record<UploadKind, "photos" | "media" | "documents"> = {
  photo: "photos",
  audio: "media",
  video: "media",
  document: "documents",
};

/** Per-user rate limits: [limit, windowSeconds]. */
export const RATE_LIMITS = {
  ask: [60, 3600],
  study: [20, 3600],
  finish: [30, 3600],
  rebuild: [20, 3600],
  upload: [300, 3600],
  youtube: [40, 3600],
  retry: [60, 3600],
  export: [10, 3600],
} as const satisfies Record<string, readonly [number, number]>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;
