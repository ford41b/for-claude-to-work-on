import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-side storage helpers (privileged). Object paths always start with the owner's user id;
 * callers pass paths read from media_files rows that were authorized earlier.
 */

export type Bucket = "photos" | "media" | "documents" | "derived";

export function objectPath(userId: string, sermonId: string, fileId: string, filename: string): string {
  const safe = filename
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80)
    .replace(/^[._]+/, "");
  return `${userId}/${sermonId}/${fileId}/${safe || "file"}`;
}

async function signedUrl(bucket: Bucket, objectPathValue: string, seconds = 600): Promise<string> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(objectPathValue, seconds);
  if (error || !data) throw new Error(`storage: could not sign ${bucket} object (${error?.message ?? "no data"})`);
  return data.signedUrl;
}

export async function downloadBytes(bucket: Bucket, objectPathValue: string, maxBytes: number): Promise<Uint8Array> {
  const url = await signedUrl(bucket, objectPathValue);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`storage: download failed with ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new Error(`storage: object larger than ${maxBytes} bytes`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error(`storage: object larger than ${maxBytes} bytes`);
  return buf;
}

/** Reads the first bytes of an object (for magic-number MIME sniffing). */
export async function readHead(bucket: Bucket, objectPathValue: string, bytes = 4100): Promise<{ head: Uint8Array; size: number | null }> {
  const url = await signedUrl(bucket, objectPathValue, 120);
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`storage: head read failed with ${res.status}`);
  const range = res.headers.get("content-range");
  const size = range ? Number(range.split("/")[1]) : Number(res.headers.get("content-length") ?? "NaN");
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
  return { head, size: Number.isFinite(size) ? size : null };
}

/** Streams an object to a temporary file. Call the returned cleanup when done. */
export async function downloadToTempFile(
  bucket: Bucket,
  objectPathValue: string,
  filename: string,
): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "sermon-media-"));
  const filePath = path.join(dir, filename.replace(/[^\w.-]+/g, "_") || "media");
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    const url = await signedUrl(bucket, objectPathValue, 3600);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`storage: download failed with ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(filePath));
    return { filePath, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export async function uploadBytes(bucket: Bucket, objectPathValue: string, data: Uint8Array, contentType: string) {
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(objectPathValue, data, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`storage: upload failed (${error.message})`);
}

export async function removeObjects(objects: { bucket: Bucket; path: string }[]) {
  const byBucket = new Map<Bucket, string[]>();
  for (const o of objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.path]);
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabaseAdmin().storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`storage: remove failed (${error.message})`);
    }
  }
}

/** Removes every object under <userId>/ in every bucket (account deletion). */
export async function removeAllUserObjects(userId: string) {
  const buckets: Bucket[] = ["photos", "media", "documents", "derived"];
  for (const bucket of buckets) {
    const paths = await listRecursive(bucket, userId);
    if (paths.length) await removeObjects(paths.map((p) => ({ bucket, path: p })));
  }
}

async function listRecursive(bucket: Bucket, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin().storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error) throw new Error(`storage: list failed (${error.message})`);
      for (const entry of data ?? []) {
        const full = `${dir}/${entry.name}`;
        if (entry.id === null) stack.push(full);
        else out.push(full);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

export async function signedReadUrl(bucket: Bucket, objectPathValue: string, seconds = 3600): Promise<string> {
  return signedUrl(bucket, objectPathValue, seconds);
}
