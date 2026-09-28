import type { CatalogUnit } from "@/lib/ai/prompts/sermon-pack";
import { noteUnit, photoUnit, recordingUnits, type EvidenceRef } from "@/lib/sources/catalog";
import { NOTEBOOK_ANALYSIS, NOTEBOOK_NOTES, NOTEBOOK_PHOTO } from "./datasets/notebook";

export interface Metric {
  name: string;
  value: number;
  /** "ratio" prints as a percentage. */
  unit: "ratio" | "count" | "ms" | "usd";
  min?: number;
  max?: number;
  note?: string;
}

export interface CaseFailure {
  id: string;
  detail: string;
  /** Present when the failure is a documented limitation rather than a regression. */
  known?: string;
}

export interface SuiteResult {
  suite: string;
  description: string;
  metrics: Metric[];
  failures: CaseFailure[];
  skipped?: string;
  info?: Record<string, string | number | null>;
}

export function metricPasses(m: Metric): boolean {
  if (m.min !== undefined && m.value < m.min) return false;
  if (m.max !== undefined && m.value > m.max) return false;
  return true;
}

export function suitePasses(r: SuiteResult): boolean {
  return Boolean(r.skipped) || r.metrics.every(metricPasses);
}

export function ratio(num: number, den: number): number {
  return den === 0 ? 1 : num / den;
}

function formatValue(m: Metric): string {
  switch (m.unit) {
    case "ratio":
      return `${(m.value * 100).toFixed(1)}%`;
    case "ms":
      return `${Math.round(m.value)} ms`;
    case "usd":
      return `$${m.value.toFixed(4)}`;
    default:
      return String(m.value);
  }
}

function formatBound(m: Metric): string {
  const f = (v: number) => formatValue({ ...m, value: v });
  if (m.min !== undefined && m.max !== undefined) return `${f(m.min)}–${f(m.max)}`;
  if (m.min !== undefined) return `≥ ${f(m.min)}`;
  if (m.max !== undefined) return `≤ ${f(m.max)}`;
  return "(info)";
}

export function printResult(r: SuiteResult) {
  const out: string[] = [];
  out.push("");
  out.push(`■ ${r.suite} — ${r.description}`);
  if (r.skipped) {
    out.push(`  skipped: ${r.skipped}`);
    console.warn(out.join("\n"));
    return;
  }
  for (const [k, v] of Object.entries(r.info ?? {})) out.push(`  ${k}: ${v ?? "—"}`);
  const width = Math.max(...r.metrics.map((m) => m.name.length));
  for (const m of r.metrics) {
    const mark = metricPasses(m) ? "✓" : "✗";
    out.push(`  ${mark} ${m.name.padEnd(width)}  ${formatValue(m).padStart(9)}   target ${formatBound(m)}${m.note ? `   ${m.note}` : ""}`);
  }
  const known = r.failures.filter((f) => f.known);
  const unknown = r.failures.filter((f) => !f.known);
  if (unknown.length) {
    out.push(`  failing cases (${unknown.length}):`);
    for (const f of unknown.slice(0, 25)) out.push(`    - ${f.id}: ${f.detail}`);
    if (unknown.length > 25) out.push(`    … ${unknown.length - 25} more`);
  }
  if (known.length) {
    out.push(`  known limitations (${known.length}):`);
    for (const f of known) out.push(`    - ${f.id}: ${f.detail} (${f.known})`);
  }
  console.warn(out.join("\n"));
}

/** Builds catalog units and refs for the synthetic notebook with the production builders. */
export function notebookCatalog(): { units: CatalogUnit[]; refs: Map<string, EvidenceRef> } {
  const units: CatalogUnit[] = [];
  const refs = new Map<string, EvidenceRef>();
  const add = ([unit, ref]: [CatalogUnit, Omit<EvidenceRef, "key" | "kind" | "label">]) => {
    units.push(unit);
    refs.set(unit.key, { ...ref, key: unit.key, kind: unit.kind, label: unit.label });
  };
  for (const built of recordingUnits(NOTEBOOK_ANALYSIS, { source_id: "src-video", source_type: "SERMON_VIDEO" })) add(built);
  NOTEBOOK_NOTES.forEach((block, i) => add(noteUnit(`N${i + 1}`, [{ source_id: "src-note", ...block }])));
  add(photoUnit({ source_id: "src-photo", ...NOTEBOOK_PHOTO }));
  return { units, refs };
}
