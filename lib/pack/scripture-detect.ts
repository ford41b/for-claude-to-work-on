import { findScripture, normalizeReference, type ScriptureMatch } from "@/lib/bible/reference";
import type { Confidence, EvidenceRef } from "@/lib/sources/catalog";
import type { CatalogUnit } from "@/lib/ai/prompts/sermon-pack";
import type { ResolvedCitation, ScriptureDetection } from "./resolve";

/**
 * Deterministic Scripture detection over every evidence unit (no AI needed). Runs before the
 * Sermon Pack so references appear early and still work when AI is unavailable.
 */

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const KIND_RANK: Record<ScriptureDetection["kind"], number> = { explicit: 3, spoken: 2, allusion: 1, inferred: 0 };

function lower(c: Confidence): Confidence {
  return c === "high" ? "medium" : "low";
}

export function detectScripture(units: CatalogUnit[], refs: Map<string, EvidenceRef>): ScriptureDetection[] {
  const found = new Map<string, ScriptureDetection>();

  const record = (m: ScriptureMatch, unit: CatalogUnit, confidence: Confidence) => {
    const ref = refs.get(unit.key);
    if (!ref) return;
    const citation: ResolvedCitation = {
      sourceId: ref.sourceId,
      sourceKey: ref.key,
      noteBlockId: ref.noteBlockId,
      timestampStart: ref.timestampStart,
      timestampEnd: ref.timestampEnd,
      page: ref.page,
      excerpt: ref.excerpt,
      confidence,
    };
    const existing = found.get(m.osis);
    if (!existing) {
      found.set(m.osis, {
        osis: m.osis,
        normalized: m.normalized,
        book: m.book,
        chapterStart: m.chapterStart,
        verseStart: m.verseStart,
        chapterEnd: m.chapterEnd,
        verseEnd: m.verseEnd,
        kind: m.kind,
        confidence,
        referenceText: m.raw.slice(0, 200) || m.normalized,
        citations: [citation],
      });
      return;
    }
    if (KIND_RANK[m.kind] > KIND_RANK[existing.kind]) existing.kind = m.kind;
    if (RANK[confidence] > RANK[existing.confidence]) existing.confidence = confidence;
    if (!existing.citations.some((c) => c.sourceKey === citation.sourceKey)) existing.citations.push(citation);
  };

  for (const unit of units) {
    const ref = refs.get(unit.key);
    const lowQuality = ref?.confidence === "low";
    const texts = [unit.text];
    const mentioned: string[] = [];
    for (const d of unit.details ?? []) {
      if (d.startsWith("Scripture mentioned: ")) mentioned.push(...d.slice(21).split("; "));
      else if (d.startsWith("On screen: ")) texts.push(d.slice(11));
    }
    for (const text of texts) {
      for (const m of findScripture(text)) record(m, unit, lowQuality ? lower(m.confidence) : m.confidence);
    }
    // References the media analysis heard or saw (spoken forms included).
    for (const mention of mentioned) {
      const m = normalizeReference(mention);
      if (m) record({ ...m, kind: m.kind === "explicit" ? "explicit" : m.kind }, unit, m.kind === "allusion" ? "medium" : lowQuality ? "low" : "medium");
    }
  }

  return [...found.values()];
}
