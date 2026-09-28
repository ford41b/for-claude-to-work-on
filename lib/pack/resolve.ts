import type { SermonPackDraft } from "@/lib/ai/prompts/sermon-pack";
import { canonicalSortKey, normalizeReference } from "@/lib/bible/reference";
import type { Confidence, EvidenceRef } from "@/lib/sources/catalog";
import { clampTimestamp } from "@/lib/time/timestamps";

/**
 * Turns a validated Sermon Pack draft into rows ready to persist. This is where the trust rules
 * are enforced in code rather than hoped for from the model:
 *   - citations resolve only to keys that exist in the catalog (unknown keys are dropped + counted)
 *   - timestamps come from cited recording segments, clamped to the recording length
 *   - "verbatim" quotes are downgraded to paraphrases unless the exact words are in cited evidence
 *   - Scripture references must parse and exist; AI-only references need cited support
 */

export interface ResolvedCitation {
  sourceId: string;
  sourceKey: string;
  noteBlockId: string | null;
  timestampStart: number | null;
  timestampEnd: number | null;
  page: number | null;
  excerpt: string;
  confidence: Confidence | null;
}

export interface TimedFields {
  timestamp_start: number | null;
  timestamp_end: number | null;
  timestamp_confidence: Confidence | null;
}

export interface Planned<T> {
  fields: T;
  citations: ResolvedCitation[];
}

export interface ScriptureDetection {
  osis: string;
  normalized: string;
  book: string;
  chapterStart: number | null;
  verseStart: number | null;
  chapterEnd: number | null;
  verseEnd: number | null;
  kind: "explicit" | "spoken" | "inferred" | "allusion";
  confidence: Confidence;
  referenceText: string;
  citations: ResolvedCitation[];
}

export interface PackPlan {
  sermon: { big_idea: string; central_thesis: string; short_summary: string; detailed_summary: string };
  sermonCitations: (ResolvedCitation & { part: string })[];
  metadata: { field: "title" | "speaker" | "church" | "series" | "preached_on"; value: string; confidence: Confidence }[];
  mainIdeas: Planned<TimedFields & { title: string; summary: string; explanation: string; scripture_refs: string[]; confidence: Confidence }>[];
  sections: Planned<TimedFields & { title: string; summary: string }>[];
  moments: Planned<TimedFields & { category: string; title: string; description: string }>[];
  scriptures: (Planned<{
    reference_text: string;
    normalized_reference: string;
    osis: string;
    book: string;
    chapter_start: number | null;
    verse_start: number | null;
    chapter_end: number | null;
    verse_end: number | null;
    kind: ScriptureDetection["kind"];
    confidence: Confidence;
    role: "primary" | "supporting" | "mentioned";
    sermon_context: string;
    timestamp_start: number | null;
    timestamp_confidence: Confidence | null;
  }>)[];
  quotes: Planned<{ text: string; quote_type: "VERBATIM_QUOTE" | "PARAPHRASE"; verbatim_evidence: string | null; timestamp_start: number | null; timestamp_confidence: Confidence | null; confidence: Confidence }>[];
  illustrations: Planned<TimedFields & { title: string; summary: string; kind: string }>[];
  applications: Planned<{ text: string; detail: string }>[];
  questions: Planned<{ text: string; timestamp_seconds: number | null }>[];
  terms: Planned<{ term: string; definition: string; context: string }>[];
  reviewItems: Planned<{ kind: string; prompt: string; detail: string }>[];
  stats: {
    citedKeys: number;
    droppedKeys: string[];
    quotesDowngraded: number;
    scriptureRejected: string[];
    itemsWithoutSources: number;
  };
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function minConfidence(values: (Confidence | null | undefined)[]): Confidence | null {
  const present = values.filter((v): v is Confidence => Boolean(v));
  if (!present.length) return null;
  return present.reduce((a, b) => (CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b));
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"‘’'`«»]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuoteMarks(text: string): string {
  return text.trim().replace(/^["“‘']+|["”’']+$/g, "").trim();
}

const MAX_SPAN_SECONDS = 15 * 60;

export interface ResolveContext {
  refs: Map<string, EvidenceRef>;
  durationSeconds: number | null;
  hasRecording: boolean;
  detections: ScriptureDetection[];
}

export function resolvePack(draft: SermonPackDraft, ctx: ResolveContext): PackPlan {
  const dropped = new Set<string>();
  let cited = 0;
  let withoutSources = 0;

  const resolveKeys = (keys: string[]): ResolvedCitation[] => {
    const out: ResolvedCitation[] = [];
    const seen = new Set<string>();
    for (const raw of keys) {
      const key = raw.trim().replace(/^\[|\]$/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      const ref = ctx.refs.get(key);
      if (!ref) {
        dropped.add(key);
        continue;
      }
      cited++;
      out.push({
        sourceId: ref.sourceId,
        sourceKey: ref.key,
        noteBlockId: ref.noteBlockId,
        timestampStart: ref.timestampStart,
        timestampEnd: ref.timestampEnd,
        page: ref.page,
        excerpt: ref.excerpt,
        confidence: ref.confidence,
      });
    }
    if (!out.length) withoutSources++;
    return out;
  };

  const timing = (keys: string[]): TimedFields => {
    const segs = keys
      .map((k) => ctx.refs.get(k.trim()))
      .filter((r): r is EvidenceRef => Boolean(r && r.kind === "segment" && r.timestampStart !== null))
      .sort((a, b) => a.timestampStart! - b.timestampStart!);
    if (segs.length) {
      const first = segs[0]!;
      const inSpan = segs.filter((s) => s.timestampStart! - first.timestampStart! <= MAX_SPAN_SECONDS);
      const start = clampTimestamp(first.timestampStart!, ctx.durationSeconds);
      const endRaw = Math.max(...inSpan.map((s) => s.timestampEnd ?? s.timestampStart!));
      const end = clampTimestamp(endRaw, ctx.durationSeconds);
      const spread = inSpan.length < segs.length;
      return {
        timestamp_start: start,
        timestamp_end: end > start ? end : null,
        timestamp_confidence: spread ? "low" : minConfidence(inSpan.map((s) => s.confidence)),
      };
    }
    // No recording segment cited: fall back to a user-captured time (note or capture).
    const captured = keys
      .map((k) => ctx.refs.get(k.trim()))
      .find((r) => r && r.timestampStart !== null && r.timestampSource === "user_capture");
    if (captured && ctx.hasRecording) {
      return { timestamp_start: clampTimestamp(captured.timestampStart!, ctx.durationSeconds), timestamp_end: null, timestamp_confidence: "medium" };
    }
    return { timestamp_start: null, timestamp_end: null, timestamp_confidence: null };
  };

  // --- Sermon-level text ----------------------------------------------------
  const sermonCitations: PackPlan["sermonCitations"] = [];
  for (const [part, value] of [
    ["big_idea", draft.big_idea],
    ["central_thesis", draft.central_thesis],
    ["short_summary", draft.short_summary],
    ["detailed_summary", draft.detailed_summary],
  ] as const) {
    for (const c of resolveKeys(value.source_keys)) sermonCitations.push({ ...c, part });
  }

  // --- Metadata -------------------------------------------------------------
  const metadata: PackPlan["metadata"] = [];
  const meta = draft.metadata_suggestions;
  for (const [field, s] of [
    ["title", meta.title],
    ["speaker", meta.speaker],
    ["church", meta.church],
    ["series", meta.series],
    ["preached_on", meta.date],
  ] as const) {
    const value = s.value?.trim();
    if (!value || s.confidence === "low") continue;
    if (field === "preached_on" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    metadata.push({ field, value: value.slice(0, 200), confidence: s.confidence });
  }

  // --- Scripture --------------------------------------------------------------
  const scriptureRejected: string[] = [];
  const byOsis = new Map<string, PackPlan["scriptures"][number]>();
  for (const d of ctx.detections) {
    byOsis.set(d.osis, {
      fields: {
        reference_text: d.referenceText,
        normalized_reference: d.normalized,
        osis: d.osis,
        book: d.book,
        chapter_start: d.chapterStart,
        verse_start: d.verseStart,
        chapter_end: d.chapterEnd,
        verse_end: d.verseEnd,
        kind: d.kind,
        confidence: d.confidence,
        role: "mentioned",
        sermon_context: "",
        timestamp_start: null,
        timestamp_confidence: null,
      },
      citations: [...d.citations],
    });
  }
  for (const s of draft.scriptures) {
    const parsed = normalizeReference(s.reference);
    if (!parsed) {
      scriptureRejected.push(s.reference);
      continue;
    }
    const citations = resolveKeys(s.source_keys);
    const existing = byOsis.get(parsed.osis);
    if (existing) {
      existing.fields.role = s.role;
      existing.fields.sermon_context = s.sermon_context;
      for (const c of citations) if (!existing.citations.some((e) => e.sourceKey === c.sourceKey)) existing.citations.push(c);
      continue;
    }
    if (!citations.length) {
      // An AI-only reference with no supporting evidence is never presented.
      scriptureRejected.push(s.reference);
      continue;
    }
    byOsis.set(parsed.osis, {
      fields: {
        reference_text: s.reference,
        normalized_reference: parsed.normalized,
        osis: parsed.osis,
        book: parsed.book,
        chapter_start: parsed.chapterStart,
        verse_start: parsed.verseStart,
        chapter_end: parsed.chapterEnd,
        verse_end: parsed.verseEnd,
        kind: parsed.kind === "allusion" ? "allusion" : "inferred",
        confidence: parsed.kind === "explicit" ? "medium" : "low",
        role: s.role,
        sermon_context: s.sermon_context,
        timestamp_start: null,
        timestamp_confidence: null,
      },
      citations,
    });
  }
  const scriptures = [...byOsis.values()];
  for (const s of scriptures) {
    const timed = s.citations
      .filter((c) => c.timestampStart !== null)
      .sort((a, b) => a.timestampStart! - b.timestampStart!)[0];
    if (timed) {
      s.fields.timestamp_start = clampTimestamp(timed.timestampStart!, ctx.durationSeconds);
      s.fields.timestamp_confidence = timed.confidence ?? "medium";
    }
  }
  const roleRank = { primary: 0, supporting: 1, mentioned: 2 } as const;
  scriptures.sort(
    (a, b) =>
      roleRank[a.fields.role] - roleRank[b.fields.role] ||
      (a.fields.timestamp_start ?? Number.MAX_SAFE_INTEGER) - (b.fields.timestamp_start ?? Number.MAX_SAFE_INTEGER) ||
      canonicalSortKey({ book: a.fields.book, chapterStart: a.fields.chapter_start, verseStart: a.fields.verse_start }) -
        canonicalSortKey({ book: b.fields.book, chapterStart: b.fields.chapter_start, verseStart: b.fields.verse_start }),
  );

  // --- Items ------------------------------------------------------------------
  const mainIdeas = draft.main_ideas.map((m) => ({
    fields: {
      title: m.title.trim(),
      summary: m.summary.trim(),
      explanation: m.explanation.trim(),
      scripture_refs: m.scripture.map((r) => normalizeReference(r)?.normalized).filter((r): r is string => Boolean(r)),
      confidence: m.confidence,
      ...timing(m.source_keys),
    },
    citations: resolveKeys(m.source_keys),
  }));

  const sections = draft.outline.map((s) => ({
    fields: { title: s.title.trim(), summary: s.summary.trim(), ...timing(s.source_keys) },
    citations: resolveKeys(s.source_keys),
  }));

  const moments = draft.moments
    .map((m) => ({
      fields: { category: m.category, title: m.title.trim(), description: m.description.trim(), ...timing(m.source_keys) },
      citations: resolveKeys(m.source_keys),
    }))
    // A timeline moment without a time is not navigable; keep only timed ones when a recording exists.
    .filter((m) => !ctx.hasRecording || m.fields.timestamp_start !== null)
    .sort((a, b) => (a.fields.timestamp_start ?? 0) - (b.fields.timestamp_start ?? 0));

  let quotesDowngraded = 0;
  const quotes = draft.quotes.map((q) => {
    const citations = resolveKeys(q.source_keys);
    const text = stripQuoteMarks(q.text);
    let quoteType: "VERBATIM_QUOTE" | "PARAPHRASE" = "PARAPHRASE";
    let evidence: string | null = null;
    if (q.quote_type === "VERBATIM_QUOTE") {
      const needle = normalizeForMatch(text);
      for (const c of citations) {
        const ref = ctx.refs.get(c.sourceKey);
        if (!ref || needle.length < 4) continue;
        if (ref.verbatimPhrases.some((p) => normalizeForMatch(p).includes(needle))) {
          quoteType = "VERBATIM_QUOTE";
          evidence =
            ref.kind === "segment"
              ? "heard_verbatim"
              : ref.kind === "note" || ref.kind === "capture"
                ? "matched_user_note"
                : ref.kind === "photo"
                  ? "matched_photo"
                  : "matched_document";
          break;
        }
      }
      if (quoteType === "PARAPHRASE") quotesDowngraded++;
    }
    const t = timing(q.source_keys);
    return {
      fields: {
        text,
        quote_type: quoteType,
        verbatim_evidence: evidence,
        timestamp_start: t.timestamp_start,
        timestamp_confidence: t.timestamp_confidence,
        confidence: quoteType === "VERBATIM_QUOTE" && evidence !== "heard_verbatim" ? ("high" as const) : ("medium" as const),
      },
      citations,
    };
  });

  const illustrations = draft.illustrations.map((i) => ({
    fields: { title: i.title.trim(), summary: i.summary.trim(), kind: i.kind, ...timing(i.source_keys) },
    citations: resolveKeys(i.source_keys),
  }));
  const applications = draft.applications.map((a) => ({
    fields: { text: a.text.trim(), detail: a.detail.trim() },
    citations: resolveKeys(a.source_keys),
  }));
  const questions = draft.questions_to_consider.map((q) => ({
    fields: { text: q.text.trim(), timestamp_seconds: timing(q.source_keys).timestamp_start },
    citations: resolveKeys(q.source_keys),
  }));
  const terms = draft.terms.map((t) => ({
    fields: { term: t.term.trim(), definition: t.definition.trim(), context: t.context.trim() },
    citations: resolveKeys(t.source_keys),
  }));
  const reviewItems = draft.review_items.map((r) => ({
    fields: { kind: r.kind, prompt: r.prompt.trim(), detail: r.detail.trim() },
    citations: resolveKeys(r.source_keys),
  }));

  return {
    sermon: {
      big_idea: draft.big_idea.text.trim(),
      central_thesis: draft.central_thesis.text.trim(),
      short_summary: draft.short_summary.text.trim(),
      detailed_summary: draft.detailed_summary.text.trim(),
    },
    sermonCitations,
    metadata,
    mainIdeas,
    sections,
    moments,
    scriptures,
    quotes,
    illustrations,
    applications,
    questions,
    terms,
    reviewItems,
    stats: {
      citedKeys: cited,
      droppedKeys: [...dropped],
      quotesDowngraded,
      scriptureRejected,
      itemsWithoutSources: withoutSources,
    },
  };
}
