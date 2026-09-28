import { createHash } from "node:crypto";

/** Deterministic JSON serialization (sorted object keys) for hashing structured input. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256(stableStringify(value));
}

/**
 * Combines source hashes into one version hash. Order-independent: the same set of sources
 * produces the same hash regardless of insertion order.
 */
export function combineHashes(hashes: readonly (string | null | undefined)[]): string {
  return sha256([...hashes].map((h) => h ?? "∅").sort().join("|"));
}
