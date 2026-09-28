import sharp from "sharp";

/**
 * Image renditions. The original upload is never modified. Derived images are auto-rotated
 * from EXIF and stripped of metadata (including GPS location) by default.
 */

export interface Rendition {
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

export async function imageInfo(data: Uint8Array): Promise<{ width: number | null; height: number | null; format: string | null }> {
  try {
    const meta = await sharp(data).metadata();
    const rotated = meta.orientation && meta.orientation >= 5;
    return {
      width: (rotated ? meta.height : meta.width) ?? null,
      height: (rotated ? meta.width : meta.height) ?? null,
      format: meta.format ?? null,
    };
  } catch {
    return { width: null, height: null, format: null };
  }
}

/** Display preview (WebP, ≤1600px). Returns null when the format can't be decoded (e.g. HEIC). */
export async function makePreview(data: Uint8Array): Promise<Rendition | null> {
  try {
    const { data: out, info } = await sharp(data, { failOn: "error" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(out), mimeType: "image/webp", width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** Analysis rendition (JPEG, ≤3072px) — large enough for handwriting, no metadata. */
export async function makeAnalysisRendition(data: Uint8Array): Promise<Rendition | null> {
  try {
    const { data: out, info } = await sharp(data, { failOn: "error" })
      .rotate()
      .resize({ width: 3072, height: 3072, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(out), mimeType: "image/jpeg", width: info.width, height: info.height };
  } catch {
    return null;
  }
}
