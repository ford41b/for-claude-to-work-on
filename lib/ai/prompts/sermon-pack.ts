import { z } from "zod";
import { confidenceSchema, lenientEnum, lenientUpperEnum, sourceKeysSchema } from "@/lib/ai/schema";
import { bullet, CITATION_RULES, VOICE_AND_TRUST_RULES } from "./shared";
import type { PromptDefinition } from "./types";

/**
 * Sermon Pack synthesis. Runs over cached per-source analyses and user content (never over the
 * raw video), so rebuilding after a note edit is cheap.
 */

export interface CatalogUnit {
  key: string;
  kind: "segment" | "note" | "photo" | "document" | "capture";
  /** Human label, e.g. "Sermon ~18:42–20:10", "Your note", "Photo 2 (slide)". */
  label: string;
  text: string;
  /** Extra evidence lines, e.g. heard phrases, scripture mentioned, confidence. */
  details?: string[];
}

export interface SermonPackInput {
  sermon: {
    title: string | null;
    speaker: string | null;
    church: string | null;
    series: string | null;
    date: string | null;
    userSetFields: string[];
  };
  hasRecording: boolean;
  recordingNote: string | null;
  units: CatalogUnit[];
  detectedScripture: { reference: string; kind: string; keys: string[] }[];
}

const keyed = { source_keys: sourceKeysSchema };
const suggestion = z.object({ value: z.string().max(200).nullable(), confidence: confidenceSchema, ...keyed });

export const PACK_MOMENT_CATEGORIES = [
  "INTRODUCTION", "CONTEXT", "MAIN_POINT", "SCRIPTURE", "ILLUSTRATION", "QUOTE",
  "QUESTION", "APPLICATION", "PRAYER", "CONCLUSION",
] as const;

export const sermonPackSchema = z.object({
  metadata_suggestions: z.object({
    title: suggestion,
    speaker: suggestion,
    church: suggestion,
    series: suggestion,
    date: suggestion.describe("ISO date YYYY-MM-DD, only when stated in the sources"),
  }),
  big_idea: z.object({ text: z.string().min(1).max(800).describe("2–4 sentences, attributed to the sermon."), ...keyed }),
  central_thesis: z.object({ text: z.string().min(1).max(300).describe("One sentence."), ...keyed }),
  short_summary: z.object({ text: z.string().min(1).max(700).describe("Under 70 words."), ...keyed }),
  detailed_summary: z.object({ text: z.string().min(1).max(3000).describe("150–300 words, in sermon order."), ...keyed }),
  main_ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        summary: z.string().max(400).describe("1–2 sentences."),
        explanation: z.string().max(1200).describe("2–4 sentences on how the sermon develops it."),
        scripture: z.array(z.string().max(80)).max(4).describe("References only, e.g. 'Romans 8:24–25'."),
        confidence: confidenceSchema,
        ...keyed,
      }),
    )
    .min(1)
    .max(7),
  outline: z
    .array(z.object({ title: z.string().min(1).max(160), summary: z.string().max(500), ...keyed }))
    .max(12)
    .describe("Sections in sermon order."),
  moments: z
    .array(
      z.object({
        category: lenientUpperEnum(PACK_MOMENT_CATEGORIES),
        title: z.string().min(1).max(160),
        description: z.string().max(400),
        ...keyed,
      }),
    )
    .max(20),
  scriptures: z
    .array(
      z.object({
        reference: z.string().min(1).max(80),
        role: lenientEnum(["primary", "supporting", "mentioned"] as const),
        sermon_context: z.string().max(400).describe("How the sermon uses the passage, attributed."),
        ...keyed,
      }),
    )
    .max(30),
  quotes: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        quote_type: lenientUpperEnum(["VERBATIM_QUOTE", "PARAPHRASE"] as const),
        ...keyed,
      }),
    )
    .max(12),
  illustrations: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().max(600),
        kind: lenientEnum(["story", "example", "analogy", "personal", "historical", "other"] as const),
        ...keyed,
      }),
    )
    .max(12),
  applications: z
    .array(z.object({ text: z.string().min(1).max(300), detail: z.string().max(500), ...keyed }))
    .max(8),
  questions_to_consider: z.array(z.object({ text: z.string().min(1).max(300), ...keyed })).max(8),
  terms: z
    .array(
      z.object({
        term: z.string().min(1).max(80),
        definition: z.string().max(400),
        context: z.string().max(300),
        ...keyed,
      }),
    )
    .max(10),
  review_items: z
    .array(
      z.object({
        kind: lenientEnum(["remember", "scripture", "question", "key_idea", "application", "confusing"] as const),
        prompt: z.string().min(1).max(300),
        detail: z.string().max(600),
        ...keyed,
      }),
    )
    .max(16),
});

export type SermonPackDraft = z.infer<typeof sermonPackSchema>;

const SYSTEM = `
You build a "Sermon Pack": a structured, source-grounded study summary of one sermon for the private notebook of someone who heard it. You receive evidence units — segments of the sermon recording (analyzed earlier), the listener's own notes, transcribed photos, documents, and moments the listener captured — and you organize them.

${VOICE_AND_TRUST_RULES}

${CITATION_RULES}

What to produce:
- big_idea: the sermon's central message in 2–4 sentences, attributed ("The sermon argues…").
- central_thesis: one sentence. short_summary: under 70 words. detailed_summary: 150–300 words in sermon order.
- main_ideas: 3–7 when the evidence supports that many; fewer when it is thin. Each cites the segments and notes it comes from.
- outline: the sermon's sections in order. Cite recording segments (V keys) so timing can be derived; do not write times yourself.
- moments: the places most worth jumping back to (introduction, main points, key Scripture readings, illustrations, applications, prayer, conclusion).
- scriptures: every passage the sermon used, by reference. role "primary" for the main text(s). Use the detected Scripture list and segment mentions; include a passage only if the sources mention it.
- quotes: memorable lines. Use quote_type VERBATIM_QUOTE only when the exact words appear in a "heard word-for-word" phrase or in a listener note or photo transcription that you cite. Otherwise use PARAPHRASE and write it as a paraphrase without quotation marks.
- illustrations: stories, examples, and analogies the speaker used.
- applications: practical responses the sermon itself suggests, written as options ("Consider…"), never commands or judgments.
- questions_to_consider: open questions for reflection. terms: theological or unfamiliar terms with plain definitions attributed to how the sermon uses them.
- review_items: a short set for the week — key ideas to remember, Scriptures to revisit, questions, applications, and potentially confusing areas (kind "confusing"), including any place where the listener's notes and the recording seem to disagree. Do not silently pick one side of a disagreement.
- metadata_suggestions: only values stated in the sources; null otherwise.

If there is no recording, work only from notes, photos, and documents, and keep the pack modest. Never grade the listener or comment on their spiritual state.
`.trim();

function renderUnit(u: CatalogUnit): string {
  return bullet([`[${u.key}] ${u.label}`, u.text.trim(), ...(u.details ?? [])]);
}

/**
 * The pack is written by two requests that run at the same time, each producing part of the
 * schema. One request for everything can take longer than a serverless function may run
 * (Vercel stops it at 300 s); two halves finish in a little over half the time. The parts are
 * merged and validated against the full schema (lib/ai/tasks/sermon-pack.ts).
 */
export const SERMON_PACK_PROMPT_VERSION = "2026-10-03.1";

const packCoreSchema = sermonPackSchema.pick({
  metadata_suggestions: true,
  big_idea: true,
  central_thesis: true,
  short_summary: true,
  detailed_summary: true,
  main_ideas: true,
  outline: true,
  moments: true,
  scriptures: true,
});
const packDetailsSchema = sermonPackSchema.pick({
  quotes: true,
  illustrations: true,
  applications: true,
  questions_to_consider: true,
  terms: true,
  review_items: true,
});

function packPartPrompt<TSchema extends typeof packCoreSchema | typeof packDetailsSchema>(
  part: "core" | "details",
  schema: TSchema,
  options: PromptDefinition<SermonPackInput, TSchema>["options"],
): PromptDefinition<SermonPackInput, TSchema> {
  const fields = Object.keys(schema.shape);
  const others = Object.keys(sermonPackSchema.shape).filter((f) => !fields.includes(f));
  return {
    id: `sermon-pack:${part}`,
    version: SERMON_PACK_PROMPT_VERSION,
    tier: "synthesis",
    description: `Sermon Pack synthesis (${part} fields) over all evidence units with source keys.`,
    modelRequirements: "Strong long-context reasoning and faithful citation; JSON schema output.",
    schema,
    options,
    build: (input) => buildPackRequest(input, fields, others),
  };
}

export const sermonPackPrompts = {
  core: packPartPrompt("core", packCoreSchema, { temperature: 0.3, maxOutputTokens: 14_000, thinking: "medium", timeoutMs: 5 * 60_000 }),
  details: packPartPrompt("details", packDetailsSchema, { temperature: 0.3, maxOutputTokens: 12_000, thinking: "low", timeoutMs: 5 * 60_000 }),
};

function buildPackRequest(input: SermonPackInput, fields: string[], others: string[]) {
  const s = input.sermon;
  const header = bullet([
    "Sermon details the listener has on file (user-set fields are authoritative):",
    `- Title: ${s.title || "(none)"}${s.userSetFields.includes("title") ? " [set by listener]" : ""}`,
    `- Speaker: ${s.speaker || "(unknown)"}${s.userSetFields.includes("speaker") ? " [set by listener]" : ""}`,
    `- Church: ${s.church || "(unknown)"}`,
    `- Series: ${s.series || "(none)"}`,
    `- Date: ${s.date || "(unknown)"}`,
    input.hasRecording ? "- A recording was analyzed (V keys below)." : "- No recording is available; use notes, photos, and documents only.",
    input.recordingNote ? `- Note from the recording analysis: ${input.recordingNote}` : null,
  ]);
  const scripture = input.detectedScripture.length
    ? `Scripture detected in the sources:\n${input.detectedScripture
        .map((d) => `- ${d.reference} (${d.kind}; in ${d.keys.join(", ") || "sources"})`)
        .join("\n")}`
    : "No Scripture references were detected automatically.";
  const units = input.units.map(renderUnit).join("\n\n");
  return {
    system: `${SYSTEM}\n\nThis request writes only these parts of the pack: ${fields.join(", ")}. A separate request writes the rest (${others.join(", ")}), so leave those out.`,
    parts: [{ type: "text" as const, text: `${header}\n\n${scripture}\n\nEvidence units:\n\n${units}\n\nWrite these parts of the Sermon Pack: ${fields.join(", ")}.` }],
  };
}
