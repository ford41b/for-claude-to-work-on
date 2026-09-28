import { sha256 } from "@/lib/hash";
import type { SermonCatalog } from "@/lib/sources/catalog";

/**
 * Retrieval chunks. Each chunk keeps its locator (source, time range, note blocks, page) so an
 * answer that uses it can cite the exact place. A sermon is never embedded as one blob.
 */
export interface Chunk {
  sourceId: string;
  sourceType: SermonCatalog["refs"] extends Map<string, infer R> ? (R extends { sourceType: infer T } ? T : never) : never;
  text: string;
  sectionTitle: string;
  timestampStart: number | null;
  timestampEnd: number | null;
  noteBlockIds: string[];
  page: number | null;
  contentHash: string;
}

const MAX_CHARS = 1500;

function split(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > MAX_CHARS && current) {
      parts.push(current);
      current = "";
    }
    if (line.length > MAX_CHARS) {
      for (let i = 0; i < line.length; i += MAX_CHARS) parts.push(line.slice(i, i + MAX_CHARS));
      continue;
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) parts.push(current);
  return parts;
}

export function chunkCatalog(catalog: SermonCatalog): Chunk[] {
  const chunks: Chunk[] = [];
  for (const unit of catalog.units) {
    const ref = catalog.refs.get(unit.key);
    if (!ref) continue;
    const extra = (unit.details ?? []).filter((d) => !d.startsWith("Kind: ") && !d.startsWith("Timing confidence"));
    const body = [unit.text, ...extra].join("\n").trim();
    if (!body) continue;
    for (const piece of split(body)) {
      const locator = `${ref.sourceId}|${ref.timestampStart ?? ""}|${ref.noteBlockIds.join(",")}|${ref.page ?? ""}`;
      chunks.push({
        sourceId: ref.sourceId,
        sourceType: ref.sourceType,
        text: piece,
        sectionTitle: unit.label,
        timestampStart: ref.timestampStart,
        timestampEnd: ref.timestampEnd,
        noteBlockIds: ref.noteBlockIds.length ? ref.noteBlockIds : ref.noteBlockId ? [ref.noteBlockId] : [],
        page: ref.page,
        contentHash: sha256(`${locator}\n${unit.label}\n${piece}`),
      });
    }
  }
  return chunks;
}

export function vectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(7) : "0")).join(",")}]`;
}
