import { describe, expect, it } from "vitest";
import type { CatalogUnit, SermonPackDraft } from "@/lib/ai/prompts/sermon-pack";
import { resolvePack } from "@/lib/pack/resolve";
import { detectScripture } from "@/lib/pack/scripture-detect";
import type { EvidenceRef } from "@/lib/sources/catalog";

function ref(key: string, over: Partial<EvidenceRef>): EvidenceRef {
  return {
    key,
    kind: "segment",
    sourceId: "src-video",
    sourceType: "SERMON_VIDEO",
    label: key,
    noteBlockId: null,
    noteBlockIds: [],
    timestampStart: null,
    timestampEnd: null,
    timestampSource: null,
    page: null,
    excerpt: "",
    text: "",
    confidence: "medium",
    verbatimPhrases: [],
    ...over,
  };
}

const refs = new Map<string, EvidenceRef>([
  ["V1", ref("V1", { timestampStart: 45, timestampEnd: 185, confidence: "high", timestampSource: "ai" })],
  ["V2", ref("V2", { timestampStart: 1122, timestampEnd: 1210, timestampSource: "ai", verbatimPhrases: ["Waiting is not the absence of faith; it is faith with its sleeves rolled up."] })],
  ["V3", ref("V3", { timestampStart: 2600, timestampEnd: 2700, timestampSource: "ai", confidence: "high" })],
  ["N1", ref("N1", { kind: "note", sourceId: "src-note", sourceType: "USER_NOTE", noteBlockId: "b1", timestampStart: 1130, timestampSource: "user_capture", confidence: "high", verbatimPhrases: ["God works while I wait"] })],
  ["P2", ref("P2", { kind: "photo", sourceId: "src-photo", sourceType: "PHOTO", verbatimPhrases: ["Faith in the Waiting\nRomans 8:24-25"] })],
]);

const s = (text: string, keys: string[] = []) => ({ text, source_keys: keys });
const meta = (value: string | null, confidence: "high" | "medium" | "low" = "high") => ({ value, confidence, source_keys: [] });

function draft(over: Partial<SermonPackDraft> = {}): SermonPackDraft {
  return {
    metadata_suggestions: { title: meta("Faith in the Waiting"), speaker: meta("Dana", "low"), church: meta(null), series: meta(null), date: meta("Sept 28", "high") },
    big_idea: s("The sermon argues waiting is trust.", ["V2", "N1"]),
    central_thesis: s("Waiting is trust.", ["V2"]),
    short_summary: s("Short.", ["V1"]),
    detailed_summary: s("Long.", ["V1", "V2", "V3"]),
    main_ideas: [{ title: "Waiting is active trust", summary: "s", explanation: "e", scripture: ["Rom 8:24-25", "Book of Nope 3"], confidence: "high", source_keys: ["V2", "N1", "V99"] }],
    outline: [{ title: "Intro", summary: "", source_keys: ["V1"] }],
    moments: [
      { category: "MAIN_POINT", title: "Point", description: "", source_keys: ["V2"] },
      { category: "APPLICATION", title: "Untimed", description: "", source_keys: ["N404"] },
    ],
    scriptures: [
      { reference: "Romans 8:24-25", role: "primary", sermon_context: "Hope for what we do not see", source_keys: ["V2"] },
      { reference: "Psalm 27:14", role: "supporting", sermon_context: "", source_keys: [] },
      { reference: "Hezekiah 4:1", role: "mentioned", sermon_context: "", source_keys: ["V1"] },
      { reference: "John 3:16", role: "mentioned", sermon_context: "", source_keys: ["V3"] },
    ],
    quotes: [
      { text: "“Waiting is not the absence of faith”", quote_type: "VERBATIM_QUOTE", source_keys: ["V2"] },
      { text: "Faith rolls up its sleeves and never quits", quote_type: "VERBATIM_QUOTE", source_keys: ["V2"] },
      { text: "God works while I wait", quote_type: "VERBATIM_QUOTE", source_keys: ["N1"] },
    ],
    illustrations: [],
    applications: [{ text: "Consider praying honestly", detail: "", source_keys: [] }],
    questions_to_consider: [],
    terms: [],
    review_items: [{ kind: "key_idea", prompt: "Waiting is trust", detail: "", source_keys: ["V2", "V3"] }],
    ...over,
  };
}

describe("resolvePack", () => {
  const detections = detectScripture(
    [{ key: "P2", kind: "photo", label: "Photo 2", text: "Faith in the Waiting\nRomans 8:24-25" } satisfies CatalogUnit],
    refs,
  );
  const plan = resolvePack(draft(), { refs, durationSeconds: 2750, hasRecording: true, detections });

  it("drops unknown citation keys and records them", () => {
    expect(plan.mainIdeas[0]!.citations.map((c) => c.sourceKey)).toEqual(["V2", "N1"]);
    expect(plan.stats.droppedKeys).toEqual(expect.arrayContaining(["V99", "N404"]));
  });

  it("derives timestamps from cited segments, never from the model", () => {
    expect(plan.mainIdeas[0]!.fields).toMatchObject({ timestamp_start: 1122, timestamp_end: 1210, timestamp_confidence: "medium" });
    expect(plan.sections[0]!.fields).toMatchObject({ timestamp_start: 45, timestamp_end: 185, timestamp_confidence: "high" });
  });

  it("lowers confidence when cited segments are far apart", () => {
    const r = plan.reviewItems[0]!;
    expect(r.citations).toHaveLength(2);
    const d = resolvePack(draft({ main_ideas: [{ title: "x", summary: "", explanation: "", scripture: [], confidence: "high", source_keys: ["V1", "V3"] }] }), {
      refs,
      durationSeconds: 2750,
      hasRecording: true,
      detections: [],
    });
    expect(d.mainIdeas[0]!.fields).toMatchObject({ timestamp_start: 45, timestamp_confidence: "low" });
  });

  it("drops untimed moments when a recording exists", () => {
    expect(plan.moments.map((m) => m.fields.title)).toEqual(["Point"]);
  });

  it("keeps verbatim only with evidence and strips quote marks", () => {
    expect(plan.quotes.map((q) => [q.fields.text, q.fields.quote_type, q.fields.verbatim_evidence])).toEqual([
      ["Waiting is not the absence of faith", "VERBATIM_QUOTE", "heard_verbatim"],
      ["Faith rolls up its sleeves and never quits", "PARAPHRASE", null],
      ["God works while I wait", "VERBATIM_QUOTE", "matched_user_note"],
    ]);
    expect(plan.stats.quotesDowngraded).toBe(1);
  });

  it("validates Scripture, merges with detections, and rejects unsupported AI references", () => {
    const refsOut = plan.scriptures.map((x) => [x.fields.normalized_reference, x.fields.role, x.fields.kind]);
    expect(refsOut).toEqual([
      ["Romans 8:24–25", "primary", "explicit"],
      ["John 3:16", "mentioned", "inferred"],
    ]);
    expect(plan.stats.scriptureRejected).toEqual(["Psalm 27:14", "Hezekiah 4:1"]);
    const romans = plan.scriptures[0]!;
    expect(romans.citations.map((c) => c.sourceKey).sort()).toEqual(["P2", "V2"]);
    expect(romans.fields.timestamp_start).toBe(1122);
  });

  it("normalizes main-idea Scripture and ignores invalid references", () => {
    expect(plan.mainIdeas[0]!.fields.scripture_refs).toEqual(["Romans 8:24–25"]);
  });

  it("only applies confident, well-formed metadata", () => {
    expect(plan.metadata).toEqual([{ field: "title", value: "Faith in the Waiting", confidence: "high" }]);
  });

  it("counts items without sources", () => {
    expect(plan.stats.itemsWithoutSources).toBeGreaterThanOrEqual(1);
  });
});
