import { createHash } from "node:crypto";
import { AIError } from "@/lib/ai/errors";
import type { AnswerInput } from "@/lib/ai/prompts/qa";
import type { MediaAnalysis, MediaAnalysisInput } from "@/lib/ai/prompts/sermon-analysis";
import { sermonPackPrompts, type SermonPackDraft, type SermonPackInput } from "@/lib/ai/prompts/sermon-pack";
import { STUDY_FORMAT_SPECS, type StudyInput } from "@/lib/ai/prompts/study";
import {
  EMBEDDING_DIMENSIONS,
  type EmbedRequest,
  type EmbedResponse,
  type GenerateRequest,
  type GenerateResponse,
  type MediaToPrepare,
  type ModelProvider,
  type PreparedMedia,
} from "@/lib/ai/types";

/**
 * Deterministic TEST provider. It does not understand media or language: it returns fixed,
 * schema-valid outputs (built from the prompt's structured input where possible) so automated
 * integration and end-to-end tests can exercise the real pipeline — jobs, validation, citation
 * resolution, persistence, retrieval, UI — without network access or API keys.
 *
 * It is refused unless AI_PROVIDER=fixture AND ALLOW_FIXTURE_AI=true, and the UI shows a
 * "Test AI provider" banner whenever it is active. Its sermon content is synthetic.
 */

export const FIXTURE_PRIVATE_VIDEO_PREFIX = "Fx7Private";

const FIXTURE_ANALYSIS: MediaAnalysis = {
  is_sermon: true,
  content_note: "Synthetic test recording. Worship music until 0:40; the sermon begins there.",
  language: "en",
  duration: "46:30",
  sermon_start: "0:40",
  sermon_end: "45:50",
  metadata: {
    title: { value: "Faith in the Waiting", confidence: "high", basis: "Title slide at 0:45" },
    speaker: { value: "Pastor Dana Reyes", confidence: "medium", basis: "Introduced at 0:50" },
    church: { value: "Grace Fellowship", confidence: "medium", basis: "Lower-third caption" },
    series: { value: "Hope That Holds", confidence: "low", basis: "Mentioned once" },
    date: { value: null, confidence: "low", basis: null },
  },
  segments: [
    { start: "0:45", end: "3:05", kind: "INTRODUCTION", summary: "The speaker introduces the theme of waiting and asks listeners what they are waiting for right now.", key_phrases: ["what are you waiting for"], scripture_mentions: [], on_screen_text: "Faith in the Waiting", timing_confidence: "high" },
    { start: "3:10", end: "8:20", kind: "CONTEXT", summary: "The speaker sets the context of Romans 8, describing creation groaning and believers waiting for what they do not yet see.", key_phrases: [], scripture_mentions: ["Romans chapter eight"], on_screen_text: "Romans 8:18-25", timing_confidence: "medium" },
    { start: "8:30", end: "14:00", kind: "MAIN_POINT", summary: "First point: waiting is not wasted. The speaker argues that God is at work during seasons that feel empty.", key_phrases: ["waiting is not wasted"], scripture_mentions: [], on_screen_text: "1. Waiting is not wasted", timing_confidence: "medium" },
    { start: "14:05", end: "18:30", kind: "ILLUSTRATION", summary: "The speaker tells a story about a farmer who plants in spring and trusts the harvest he cannot yet see.", key_phrases: [], scripture_mentions: ["James 5:7"], on_screen_text: null, timing_confidence: "medium" },
    { start: "18:42", end: "20:10", kind: "MAIN_POINT", summary: "Second point: waiting can be an active expression of trust rather than passivity.", key_phrases: ["waiting is not the absence of faith"], scripture_mentions: [], on_screen_text: "2. Waiting is active trust", timing_confidence: "medium" },
    { start: "24:10", end: "28:00", kind: "SCRIPTURE", summary: "The speaker reads Psalm 27 and connects waiting on the Lord with courage.", key_phrases: [], scripture_mentions: ["Psalm twenty-seven fourteen"], on_screen_text: "Psalm 27:14", timing_confidence: "medium" },
    { start: "28:15", end: "31:30", kind: "MAIN_POINT", summary: "Third point: hope shapes how we wait. The speaker explains Romans 8:24-25 as hoping for what we do not see.", key_phrases: ["hope shapes how we wait"], scripture_mentions: ["Romans 8:24-25"], on_screen_text: "3. Hope shapes how we wait", timing_confidence: "medium" },
    { start: "31:42", end: "37:30", kind: "APPLICATION", summary: "The speaker addresses anxiety, encouraging listeners to bring anxious thoughts to God in prayer rather than carrying them alone.", key_phrases: ["bring it to God before you bring it to bed"], scripture_mentions: ["Philippians 4:6-7"], on_screen_text: null, timing_confidence: "medium" },
    { start: "37:42", end: "43:00", kind: "APPLICATION", summary: "The speaker suggests practices for waiting well: honest prayer, community, and remembering past faithfulness.", key_phrases: [], scripture_mentions: [], on_screen_text: "Wait well: pray honestly, stay connected, remember", timing_confidence: "medium" },
    { start: "43:08", end: "45:50", kind: "CONCLUSION", summary: "The speaker closes with a prayer for those in a season of waiting.", key_phrases: [], scripture_mentions: [], on_screen_text: null, timing_confidence: "high" },
  ],
  quotes: [
    { text: "Waiting is not the absence of faith; it is faith with its sleeves rolled up.", at: "19:02", heard_verbatim: true, confidence: "high" },
    { text: "Bring it to God before you bring it to bed.", at: "33:10", heard_verbatim: true, confidence: "medium" },
  ],
  illustrations: [
    { title: "The farmer and the harvest", summary: "A farmer plants in spring and trusts a harvest he cannot yet see.", kind: "story", start: "14:05", end: "18:30" },
  ],
};

function hashNumbers(text: string, count: number): number[] {
  const out: number[] = [];
  let seed = createHash("sha256").update(text).digest();
  while (out.length < count) {
    for (let i = 0; i + 1 < seed.length && out.length < count; i += 2) out.push(seed.readUInt16BE(i) / 65535 - 0.5);
    seed = createHash("sha256").update(seed).digest();
  }
  return out;
}

/** Bag-of-words hashing embeddings: deterministic, and texts sharing words are similar. */
export function fixtureEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  for (const w of words) {
    const h = createHash("md5").update(w).digest();
    const idx = h.readUInt16BE(0) % EMBEDDING_DIMENSIONS;
    vec[idx] = (vec[idx] ?? 0) + (h[2]! % 2 === 0 ? 1 : -1);
  }
  if (words.length === 0) return normalize(hashNumbers(text || "empty", EMBEDDING_DIMENSIONS));
  return normalize(vec);
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 0 ? v.map((x) => x / n) : v;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function firstSentence(text: string, max = 140): string {
  const s = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The fields one part prompt of the pack asks for. */
function pickFields(pack: SermonPackDraft, prompt: { schema: { shape: object } }) {
  return Object.fromEntries(Object.keys(prompt.schema.shape).map((k) => [k, pack[k as keyof SermonPackDraft]]));
}

function buildPack(input: SermonPackInput): SermonPackDraft {
  const segments = input.units.filter((u) => u.kind === "segment");
  const notes = input.units.filter((u) => u.kind === "note");
  const photos = input.units.filter((u) => u.kind === "photo");
  const kindOf = (u: (typeof segments)[number]) =>
    (u.details ?? []).find((d) => d.startsWith("Kind: "))?.slice(6) ?? "MAIN_POINT";
  const mainSegments = segments.filter((s) => kindOf(s) === "MAIN_POINT");
  const ideaSources = mainSegments.length ? mainSegments : segments.length ? segments.slice(0, 3) : [...notes, ...photos].slice(0, 3);
  const noteKey = notes[0]?.key;
  const photoKey = photos[0]?.key;
  const main_ideas = ideaSources.slice(0, 5).map((u, i) => ({
    title: capitalize(firstSentence(u.text.replace(/^(First|Second|Third) point:\s*/i, ""), 90).replace(/\.$/, "")),
    summary: firstSentence(u.text, 300),
    explanation: `The sermon develops this idea in ${u.label.toLowerCase()}.`,
    scripture: [] as string[],
    confidence: "medium" as const,
    source_keys: [u.key, ...(i === 1 && noteKey ? [noteKey] : []), ...(i === 1 && photoKey ? [photoKey] : [])],
  }));
  const detected = input.detectedScripture;
  const bigIdeaKeys = ideaSources.slice(0, 2).map((u) => u.key);
  const mapCategory = (k: string) =>
    (["INTRODUCTION", "CONTEXT", "MAIN_POINT", "SCRIPTURE", "ILLUSTRATION", "QUOTE", "QUESTION", "APPLICATION", "PRAYER", "CONCLUSION"].includes(k)
      ? k
      : "MAIN_POINT") as SermonPackDraft["moments"][number]["category"];
  const heard = segments
    .flatMap((s) => (s.details ?? []).filter((d) => d.startsWith("Heard word-for-word: ")).map((d) => ({ key: s.key, text: d.slice(21).replace(/^"|"$/g, "").split('" | "')[0] ?? "" })))
    .filter((q) => q.text);
  return {
    metadata_suggestions: {
      title: { value: segments.length ? "Faith in the Waiting" : null, confidence: "medium", source_keys: segments[0] ? [segments[0].key] : [] },
      speaker: { value: segments.length ? "Pastor Dana Reyes" : null, confidence: "medium", source_keys: segments[0] ? [segments[0].key] : [] },
      church: { value: null, confidence: "low", source_keys: [] },
      series: { value: null, confidence: "low", source_keys: [] },
      date: { value: null, confidence: "low", source_keys: [] },
    },
    big_idea: {
      text: segments.length
        ? "The sermon argues that waiting can be an active expression of trust. It presents seasons of waiting as places where God is still at work and where hope shapes how believers wait."
        : `Your notes center on: ${firstSentence((notes[0] ?? photos[0])?.text ?? "this sermon")}`,
      source_keys: bigIdeaKeys,
    },
    central_thesis: { text: "Waiting can be an active expression of trust.", source_keys: bigIdeaKeys },
    short_summary: {
      text: "The sermon walks through Romans 8 and presents waiting as active trust, shaped by hope, with practical encouragement for anxious seasons.",
      source_keys: bigIdeaKeys,
    },
    detailed_summary: {
      text: segments.map((s) => firstSentence(s.text, 200)).join(" ") || (notes[0]?.text ?? "Summary unavailable."),
      source_keys: segments.slice(0, 4).map((s) => s.key),
    },
    main_ideas: main_ideas.length ? main_ideas : [{ title: "Notes from this sermon", summary: "Your captured notes.", explanation: "", scripture: [], confidence: "low", source_keys: [] }],
    outline: segments.slice(0, 10).map((s) => ({ title: firstSentence(s.text, 80).replace(/\.$/, ""), summary: firstSentence(s.text, 300), source_keys: [s.key] })),
    moments: segments.slice(0, 12).map((s) => ({
      category: mapCategory(kindOf(s)),
      title: firstSentence(s.text, 80).replace(/\.$/, ""),
      description: firstSentence(s.text, 300),
      source_keys: [s.key],
    })),
    scriptures: detected.slice(0, 10).map((d, i) => ({
      reference: d.reference,
      role: i === 0 ? ("primary" as const) : ("supporting" as const),
      sermon_context: "The sermon uses this passage to support its main point about waiting.",
      source_keys: d.keys.slice(0, 3),
    })),
    quotes: [
      ...heard.slice(0, 2).map((q) => ({ text: q.text, quote_type: "VERBATIM_QUOTE" as const, source_keys: [q.key] })),
      ...(segments[4] ? [{ text: "Waiting can be trust in action rather than doing nothing", quote_type: "PARAPHRASE" as const, source_keys: [segments[4].key] }] : []),
    ],
    illustrations: segments
      .filter((s) => kindOf(s) === "ILLUSTRATION")
      .map((s) => ({ title: "The farmer and the harvest", summary: firstSentence(s.text, 300), kind: "story" as const, source_keys: [s.key] })),
    applications: segments
      .filter((s) => kindOf(s) === "APPLICATION")
      .slice(0, 3)
      .map((s) => ({ text: `Consider: ${firstSentence(s.text, 200)}`, detail: "", source_keys: [s.key] })),
    questions_to_consider: [{ text: "Where in your life are you waiting right now, and what would active trust look like there?", source_keys: bigIdeaKeys.slice(0, 1) }],
    terms: segments.length ? [{ term: "Hope", definition: "In this sermon, confident expectation of what is not yet seen.", context: "Romans 8:24–25", source_keys: segments[6] ? [segments[6].key] : [] }] : [],
    review_items: [
      { kind: "key_idea", prompt: "Waiting can be an active expression of trust.", detail: "", source_keys: bigIdeaKeys.slice(0, 1) },
      ...(detected[0] ? [{ kind: "scripture" as const, prompt: `Reread ${detected[0].reference}.`, detail: "", source_keys: detected[0].keys.slice(0, 1) }] : []),
      { kind: "question", prompt: "What are you waiting for right now?", detail: "", source_keys: segments[0] ? [segments[0].key] : [] },
    ],
  };
}

function classify(question: string) {
  const q = question.toLowerCase();
  const type = /\bi (wrote|write|noted|note)\b|my notes?\b/.test(q)
    ? "user_notes"
    : /\bslide|photo|picture/.test(q)
      ? "photo"
      : /\bplan|study\b/.test(q)
        ? "study_plan"
        : /\bverse|passage|scripture|romans|psalm|john\b/.test(q)
          ? "scripture"
          : /\bwhen|minute|where did\b/.test(q)
            ? "timeline"
            : "sermon_content";
  return { question_type: type, search_query: question.replace(/[?]/g, "").slice(0, 300), wants_timestamp: /\bwhen|where|minute\b/.test(q) };
}

function answer(input: AnswerInput) {
  const top = input.evidence.slice(0, 2);
  if (top.length === 0) {
    return {
      answer: "I can't find where the sermon addresses that in your notebook.",
      cited_keys: [],
      confidence: "low",
      supported_by_sermon: false,
      general_background: null,
      follow_ups: [],
    };
  }
  const lines = top.map((e) => `${firstSentence(e.text, 220)} [${e.key}]`);
  return {
    answer: `Here's what your notebook shows. ${lines.join(" ")}`,
    cited_keys: top.map((e) => e.key),
    confidence: "medium",
    supported_by_sermon: true,
    general_background: null,
    follow_ups: ["Which Scripture supported this point?"],
  };
}

function study(input: StudyInput) {
  const spec = STUDY_FORMAT_SPECS[input.format];
  const keys = input.units.slice(0, 2).map((u) => u.key);
  return {
    title: `${spec.label} study: ${input.sermon.title || "This sermon"}`,
    big_idea: input.bigIdea ?? "This study follows the sermon's main idea.",
    primary_scripture: input.scriptures[0]?.reference ?? null,
    estimated_minutes: spec.minutes,
    sections: spec.sections.map((key) => ({
      key,
      heading: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      body: key === "background" ? "General context (not from the sermon): Paul wrote Romans to believers in Rome." : `The sermon connects this passage to waiting as active trust.`,
      items: key === "discussion_questions" || key === "observe" ? ["What does the passage say about hope?", "Where do you see waiting in your life?"] : [],
      source_keys: key === "background" ? [] : keys,
    })),
  };
}

export class FixtureProvider implements ModelProvider {
  readonly id = "fixture";
  readonly label = "Test AI provider (synthetic output)";
  readonly supportsYouTubeUrls = true;
  readonly embeddingModel = "fixture-embedding";
  readonly embeddingDimensions = EMBEDDING_DIMENSIONS;

  modelFor(): string {
    return "fixture-model";
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const { promptId, input } = req.trace;
    let output: unknown;
    switch (promptId) {
      case "sermon-analysis": {
        const media = (input as MediaAnalysisInput).media;
        if (media.kind === "youtube" && media.url.includes(FIXTURE_PRIVATE_VIDEO_PREFIX)) {
          throw new AIError("media_private", { detail: "fixture: simulated private video" });
        }
        output = FIXTURE_ANALYSIS;
        break;
      }
      case "image-analysis":
        output = {
          photo_kind: "slide",
          title: "Faith in the Waiting",
          contains_handwriting: false,
          blocks: [
            { type: "heading", text: "Faith in the Waiting", confidence: "high", unclear: false },
            { type: "scripture", text: "Romans 8:24–25", confidence: "high", unclear: false },
            { type: "list_item", text: "Waiting is not wasted", confidence: "high", unclear: false },
            { type: "list_item", text: "Waiting is active trust", confidence: "medium", unclear: false },
            { type: "list_item", text: "Hope shapes how we [unclear]", confidence: "low", unclear: true },
          ],
          overall_confidence: "medium",
          legibility_note: "Synthetic test transcription. The last line is partly cut off.",
          scripture_mentions: ["Romans 8:24–25"],
        };
        break;
      case "document-analysis":
        output = {
          title: "Sermon handout",
          pages: [{ page: 1, text: "Faith in the Waiting\n• Read Romans 8:18–25\n• Psalm 27:14", headings: ["Faith in the Waiting"] }],
          scripture_mentions: ["Romans 8:18–25", "Psalm 27:14"],
          overall_confidence: "high",
          note: "Synthetic test extraction.",
        };
        break;
      case "sermon-pack:core":
      case "sermon-pack:details":
        output = pickFields(buildPack(input as SermonPackInput), promptId === "sermon-pack:core" ? sermonPackPrompts.core : sermonPackPrompts.details);
        break;
      case "qa-classify":
        output = classify((input as { question: string }).question);
        break;
      case "qa-answer":
        output = answer(input as AnswerInput);
        break;
      case "bible-study":
        output = study(input as StudyInput);
        break;
      default:
        if (promptId.endsWith(":repair")) throw new AIError("invalid_output", { detail: "fixture: repair not supported" });
        throw new AIError("unavailable", { detail: `fixture: no fixture for prompt ${promptId}` });
    }
    const text = JSON.stringify(output);
    return {
      text,
      model: "fixture-model",
      latencyMs: 5,
      usage: { inputTokens: 100, outputTokens: Math.ceil(text.length / 4), thinkingTokens: 0, totalTokens: 100 + Math.ceil(text.length / 4) },
    };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    return {
      vectors: req.texts.map(fixtureEmbedding),
      model: this.embeddingModel,
      dimensions: EMBEDDING_DIMENSIONS,
      usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 },
    };
  }

  async prepareMedia(input: MediaToPrepare): Promise<PreparedMedia> {
    return { provider: this.id, uri: `fixture://${input.displayName}`, mimeType: input.mimeType, handle: input.displayName };
  }

  async releaseMedia(): Promise<void> {}
}
