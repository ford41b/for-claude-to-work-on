import type { SermonPackDraft } from "@/lib/ai/prompts/sermon-pack";
import { findScripture } from "@/lib/bible/reference";
import { normalizeForMatch, resolvePack, type PackPlan, type ResolvedCitation } from "@/lib/pack/resolve";
import { detectScripture } from "@/lib/pack/scripture-detect";
import type { EvidenceRef } from "@/lib/sources/catalog";
import { NOTEBOOK_DURATION, NOTEBOOK_TRUTH } from "../datasets/notebook";
import { notebookCatalog, ratio, type CaseFailure, type SuiteResult } from "../lib";

/**
 * Trust enforcement without a model: adversarial Sermon Pack drafts (invented keys, invented
 * "verbatim" quotes, invented or unsupported Scripture, out-of-range times) go through the
 * same resolver the worker uses. Every leak here would reach a listener as a false citation.
 */

const s = (text: string, keys: string[]) => ({ text, source_keys: keys });
const meta = { value: null, confidence: "low" as const, source_keys: [] };

function honestDraft(): SermonPackDraft {
  return {
    metadata_suggestions: { title: meta, speaker: meta, church: meta, series: meta, date: meta },
    big_idea: s("The sermon presents waiting as active trust: God is at work in the wait, and waiting renews strength.", ["V2", "V3", "V4", "V6"]),
    central_thesis: s("Waiting on God is faith at work, not faith on hold.", ["V3"]),
    short_summary: s("Hope is for what is not yet seen; waiting is active, God works in it, and it renews strength.", ["V2", "V3", "V4", "V6"]),
    detailed_summary: s("Opens with a delayed flight, reads Romans 8:24–25, then three points and an application.", ["V1", "V2", "V3", "V4", "V6", "V7"]),
    main_ideas: [
      { title: "Waiting is active trust", summary: "", explanation: "", scripture: ["James 5:7"], confidence: "high", source_keys: ["V3"] },
      { title: "God works in the waiting", summary: "", explanation: "", scripture: ["Romans 8:28"], confidence: "high", source_keys: ["V4", "N2"] },
      { title: "Waiting renews strength", summary: "", explanation: "", scripture: ["Isaiah 40:31"], confidence: "high", source_keys: ["V6"] },
    ],
    outline: [
      { title: "Everybody is waiting", summary: "", source_keys: ["V1"] },
      { title: "Hope that is not seen", summary: "", source_keys: ["V2"] },
      { title: "Application", summary: "", source_keys: ["V7"] },
    ],
    moments: [
      { category: "SCRIPTURE", title: "Romans 8:24–25 read", description: "", source_keys: ["V2"] },
      { category: "ILLUSTRATION", title: "The grandmother's prayer journal", description: "", source_keys: ["V5"] },
    ],
    scriptures: [
      { reference: "Romans 8:24-25", role: "primary", sermon_context: "Hope is for what is not yet seen.", source_keys: ["V2", "P1"] },
      { reference: "Romans 8:28", role: "supporting", sermon_context: "Nothing in the wait is wasted.", source_keys: ["V4", "N2"] },
      { reference: "Isaiah 40:31", role: "supporting", sermon_context: "Waiting renews strength.", source_keys: ["V6"] },
      { reference: "James 5:7", role: "mentioned", sermon_context: "The patient farmer.", source_keys: ["V3"] },
      { reference: "Psalm 27:14", role: "mentioned", sermon_context: "A prayer for the week.", source_keys: ["V7"] },
    ],
    quotes: [
      { text: "“Hope that is seen is not hope.”", quote_type: "VERBATIM_QUOTE", source_keys: ["V2"] },
      { text: "Waiting is not the absence of faith; it is faith with its sleeves rolled up.", quote_type: "VERBATIM_QUOTE", source_keys: ["V3"] },
      { text: "Nothing in the waiting room is wasted.", quote_type: "VERBATIM_QUOTE", source_keys: ["V4"] },
      { text: "God works while I wait", quote_type: "VERBATIM_QUOTE", source_keys: ["N2"] },
    ],
    illustrations: [{ title: "Delayed flight", summary: "", kind: "story", source_keys: ["V1"] }],
    applications: [{ text: "Write down one small sign of faithfulness each day.", detail: "", source_keys: ["V7", "N3"] }],
    questions_to_consider: [{ text: "Am I waiting or avoiding a decision?", source_keys: ["N4"] }],
    terms: [],
    review_items: [{ kind: "key_idea", prompt: "Waiting is active trust", detail: "", source_keys: ["V3"] }],
  };
}

const INVENTED_KEYS = ["V99", "K3", "N77", "[P9]", "D1.p1", "C4", "V0", "v3"];

function withInventedKeys(d: SermonPackDraft): SermonPackDraft {
  const inject = <T extends { source_keys: string[] }>(x: T): T => ({ ...x, source_keys: [...x.source_keys, ...INVENTED_KEYS] });
  return {
    ...d,
    big_idea: inject(d.big_idea),
    main_ideas: d.main_ideas.map(inject),
    outline: d.outline.map(inject),
    moments: [...d.moments.map(inject), { category: "QUOTE", title: "Only invented keys", description: "", source_keys: INVENTED_KEYS }],
    scriptures: d.scriptures.map(inject),
    quotes: d.quotes.map(inject),
    applications: d.applications.map(inject),
  };
}

const INVENTED_QUOTES = [
  { text: "Faith is the waiting room of heaven.", quote_type: "VERBATIM_QUOTE" as const, source_keys: ["V3"] },
  { text: "Waiting isn't the absence of faith, it's faith at work.", quote_type: "VERBATIM_QUOTE" as const, source_keys: ["V3"] },
  // Real words, wrong citation: the evidence must be in the cited unit.
  { text: "They shall mount up with wings as eagles.", quote_type: "VERBATIM_QUOTE" as const, source_keys: ["V1"] },
  { text: "Hope that is seen is not hope.", quote_type: "VERBATIM_QUOTE" as const, source_keys: ["V99"] },
];

const INVALID_SCRIPTURE = [
  { reference: "Hezekiah 4:1", role: "mentioned" as const, sermon_context: "", source_keys: ["V1"] },
  { reference: "John 3:99", role: "mentioned" as const, sermon_context: "", source_keys: ["V2"] },
  { reference: "Psalm 151", role: "mentioned" as const, sermon_context: "", source_keys: ["V2"] },
  { reference: "Hebrews 11:1", role: "supporting" as const, sermon_context: "", source_keys: [] },
  { reference: "Genesis 15:6", role: "supporting" as const, sermon_context: "", source_keys: ["V99"] },
];

/** A plausible-sounding reference the sermon never used, cited to an unrelated segment. */
const INFERRED_SCRIPTURE = { reference: "John 3:16", role: "mentioned" as const, sermon_context: "", source_keys: ["V1"] };

function allTimed(plan: PackPlan) {
  return [
    ...plan.mainIdeas.map((x) => ({ label: `main idea “${x.fields.title}”`, start: x.fields.timestamp_start, end: x.fields.timestamp_end, citations: x.citations })),
    ...plan.sections.map((x) => ({ label: `section “${x.fields.title}”`, start: x.fields.timestamp_start, end: x.fields.timestamp_end, citations: x.citations })),
    ...plan.moments.map((x) => ({ label: `moment “${x.fields.title}”`, start: x.fields.timestamp_start, end: x.fields.timestamp_end, citations: x.citations })),
    ...plan.quotes.map((x) => ({ label: `quote “${x.fields.text}”`, start: x.fields.timestamp_start, end: null, citations: x.citations })),
    ...plan.illustrations.map((x) => ({ label: `illustration “${x.fields.title}”`, start: x.fields.timestamp_start, end: x.fields.timestamp_end, citations: x.citations })),
    ...plan.scriptures.map((x) => ({ label: `scripture ${x.fields.normalized_reference}`, start: x.fields.timestamp_start, end: null, citations: x.citations })),
    ...plan.questions.map((x) => ({ label: `question “${x.fields.text}”`, start: x.fields.timestamp_seconds, end: null, citations: x.citations })),
  ];
}

function allCitations(plan: PackPlan): ResolvedCitation[] {
  return [
    ...plan.sermonCitations,
    ...[plan.mainIdeas, plan.sections, plan.moments, plan.scriptures, plan.quotes, plan.illustrations, plan.applications, plan.questions, plan.terms, plan.reviewItems].flatMap(
      (list: { citations: ResolvedCitation[] }[]) => list.flatMap((x) => x.citations),
    ),
  ];
}

export function verbatimSupported(text: string, citations: ResolvedCitation[], refs: Map<string, EvidenceRef>): boolean {
  const needle = normalizeForMatch(text);
  return citations.some((c) => refs.get(c.sourceKey)?.verbatimPhrases.some((p) => normalizeForMatch(p).includes(needle)));
}

export function runGroundingSuite(): SuiteResult {
  const { units, refs } = notebookCatalog();
  const detections = detectScripture(units, refs);
  const ctx = { refs, durationSeconds: NOTEBOOK_DURATION, hasRecording: true, detections };
  const failures: CaseFailure[] = [];
  const sourceOsis = new Set(units.flatMap((u) => [u.text, ...(u.details ?? [])]).flatMap((t) => findScripture(t).map((m) => m.osis)));

  // 1. Honest draft: nothing valid may be lost.
  const honest = resolvePack(honestDraft(), ctx);
  const honestOsis = new Set(honest.scriptures.map((x) => x.fields.osis));
  const truthKept = NOTEBOOK_TRUTH.scripture.filter((o) => honestOsis.has(o));
  for (const o of NOTEBOOK_TRUTH.scripture) if (!honestOsis.has(o)) failures.push({ id: "honest-scripture", detail: `lost ${o}` });
  const genuineQuotes = honest.quotes.filter((q) => q.fields.quote_type === "VERBATIM_QUOTE");
  for (const q of honest.quotes) if (q.fields.quote_type !== "VERBATIM_QUOTE") failures.push({ id: "honest-quote", detail: `downgraded genuine quote “${q.fields.text}”` });
  if (honest.stats.droppedKeys.length) failures.push({ id: "honest-keys", detail: `dropped valid keys ${honest.stats.droppedKeys.join(", ")}` });
  const primary = honest.scriptures[0]?.fields.osis;
  if (primary !== NOTEBOOK_TRUTH.primaryScripture) failures.push({ id: "honest-primary", detail: `primary passage is ${primary ?? "none"}` });

  // 2. Invented keys.
  const keyed = resolvePack(withInventedKeys(honestDraft()), ctx);
  const leakedKeys = allCitations(keyed).filter((c) => !refs.has(c.sourceKey));
  for (const c of leakedKeys) failures.push({ id: "invented-keys", detail: `citation to missing key ${c.sourceKey}` });
  const shouldDrop = INVENTED_KEYS.map((k) => k.replace(/^\[|\]$/g, ""));
  const notRecorded = shouldDrop.filter((k) => !keyed.stats.droppedKeys.includes(k));
  for (const k of notRecorded) failures.push({ id: "invented-keys", detail: `invented key ${k} not recorded as dropped` });
  const onlyInvented = keyed.moments.find((m) => m.fields.title === "Only invented keys");
  if (onlyInvented) failures.push({ id: "invented-keys", detail: "a moment citing only invented keys was kept on the timeline" });

  // 3. Invented "verbatim" quotes.
  const quoted = resolvePack({ ...honestDraft(), quotes: INVENTED_QUOTES }, ctx);
  const leakedVerbatim = quoted.quotes.filter((q) => q.fields.quote_type === "VERBATIM_QUOTE" && !verbatimSupported(q.fields.text, q.citations, refs));
  const inventedAsVerbatim = quoted.quotes.filter((q) => q.fields.quote_type === "VERBATIM_QUOTE");
  for (const q of inventedAsVerbatim) failures.push({ id: "invented-quotes", detail: `kept as verbatim: “${q.fields.text}”` });

  // 4. Invalid, unsupported, and inferred Scripture.
  const scripted = resolvePack({ ...honestDraft(), scriptures: [...honestDraft().scriptures, ...INVALID_SCRIPTURE, INFERRED_SCRIPTURE] }, ctx);
  const invalidLeaked = scripted.scriptures.filter((x) => ["Hezekiah", "Ps.151"].some((b) => x.fields.osis.includes(b)) || x.fields.osis.startsWith("John.3.99") || ["Heb.11.1", "Gen.15.6"].includes(x.fields.osis));
  for (const x of invalidLeaked) failures.push({ id: "invalid-scripture", detail: `kept ${x.fields.normalized_reference}` });
  const unsupportedAsDetected = scripted.scriptures.filter((x) => !sourceOsis.has(x.fields.osis) && x.fields.kind !== "inferred" && x.fields.kind !== "allusion");
  for (const x of unsupportedAsDetected) failures.push({ id: "inferred-scripture", detail: `${x.fields.normalized_reference} presented as ${x.fields.kind} without appearing in any source` });
  const inferred = scripted.scriptures.find((x) => x.fields.osis === "John.3.16");
  if (inferred && inferred.fields.confidence === "high") failures.push({ id: "inferred-scripture", detail: "inferred John 3:16 carries high confidence" });

  // 5. Timing: truncated recording, and items that cite only untimed notes.
  const truncated = resolvePack(honestDraft(), { ...ctx, durationSeconds: 2_000 });
  const timingPlans = [honest, keyed, quoted, scripted, truncated];
  let outOfRange = 0;
  let untimedEvidence = 0;
  let timedItems = 0;
  timingPlans.forEach((plan, i) => {
    const limit = plan === truncated ? 2_000 : NOTEBOOK_DURATION;
    for (const t of allTimed(plan)) {
      if (t.start === null) continue;
      timedItems++;
      if (t.start < 0 || t.start > limit || (t.end !== null && (t.end > limit || t.end < t.start))) {
        outOfRange++;
        failures.push({ id: `timing-${i}`, detail: `${t.label} at ${t.start}–${t.end ?? ""} outside 0–${limit}` });
      }
      if (!t.citations.some((c) => c.timestampStart !== null)) {
        untimedEvidence++;
        failures.push({ id: `timing-${i}`, detail: `${t.label} has a time but no timed evidence` });
      }
    }
  });
  const untimedMoments = timingPlans.flatMap((p) => p.moments).filter((m) => m.fields.timestamp_start === null).length;

  return {
    suite: "grounding",
    description: "Citation, quote, Scripture, and timestamp enforcement on adversarial Sermon Pack drafts",
    info: { catalog_units: units.length, detected_scripture: detections.length, timed_items_checked: timedItems },
    metrics: [
      { name: "valid_scripture_kept", value: ratio(truthKept.length, NOTEBOOK_TRUTH.scripture.length), unit: "ratio", min: 1 },
      { name: "genuine_verbatim_kept", value: ratio(genuineQuotes.length, honest.quotes.length), unit: "ratio", min: 1 },
      { name: "invented_keys_leaked", value: leakedKeys.length + (onlyInvented ? 1 : 0), unit: "count", max: 0 },
      { name: "invented_keys_unrecorded", value: notRecorded.length, unit: "count", max: 0 },
      { name: "invented_verbatim_leaked", value: leakedVerbatim.length + inventedAsVerbatim.length, unit: "count", max: 0 },
      { name: "invalid_scripture_leaked", value: invalidLeaked.length, unit: "count", max: 0 },
      { name: "unsupported_scripture_as_detected", value: unsupportedAsDetected.length, unit: "count", max: 0 },
      { name: "timestamps_out_of_range", value: outOfRange, unit: "count", max: 0 },
      { name: "timestamps_without_timed_evidence", value: untimedEvidence, unit: "count", max: 0 },
      { name: "untimed_moments_on_timeline", value: untimedMoments, unit: "count", max: 0 },
    ],
    failures,
  };
}
