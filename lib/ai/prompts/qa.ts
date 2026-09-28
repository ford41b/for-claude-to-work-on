import { z } from "zod";
import { confidenceSchema, lenientEnum } from "@/lib/ai/schema";
import { bullet, VOICE_AND_TRUST_RULES } from "./shared";
import type { PromptDefinition } from "./types";

// ---------------------------------------------------------------------------
// 1) Question classification (fast tier)
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = [
  "sermon_content",
  "user_notes",
  "scripture",
  "photo",
  "study_plan",
  "timeline",
  "general_background",
  "out_of_scope",
] as const;

export const questionClassificationSchema = z.object({
  question_type: lenientEnum(QUESTION_TYPES),
  search_query: z.string().min(1).max(300).describe("A short keyword-rich query for searching the notebook."),
  wants_timestamp: z.boolean().describe("True when the user asks where/when something was said."),
});

export type QuestionClassification = z.infer<typeof questionClassificationSchema>;

export const classifyQuestionPrompt: PromptDefinition<{ question: string }, typeof questionClassificationSchema> = {
  id: "qa-classify",
  version: "2026-09-28.1",
  tier: "fast",
  description: "Routes an Ask AI question and rewrites it as a retrieval query.",
  modelRequirements: "Any small instruction-following model with JSON output.",
  schema: questionClassificationSchema,
  options: { temperature: 0, maxOutputTokens: 400, thinking: "minimal", timeoutMs: 20_000 },
  build({ question }) {
    return {
      system: bullet([
        "Classify a question someone asks about one sermon in their personal study notebook.",
        "question_type: sermon_content (what the preacher said), user_notes (what I wrote), scripture (passages and how they were used), photo (slides or photos), study_plan (make a plan, study, or outline), timeline (when/where something was said), general_background (history or context beyond the sermon), out_of_scope (unrelated to the sermon or faith study).",
        "search_query: the key terms to search for, without filler words.",
      ]),
      parts: [{ type: "text", text: `Question: ${question}` }],
    };
  },
};

// ---------------------------------------------------------------------------
// 2) Grounded answer (synthesis tier)
// ---------------------------------------------------------------------------

export interface AnswerEvidence {
  key: string;
  label: string;
  text: string;
}

export interface AnswerInput {
  question: string;
  questionType: QuestionClassification["question_type"];
  sermon: { title: string | null; speaker: string | null };
  overview: { bigIdea: string | null; mainIdeas: string[]; scriptures: string[] };
  evidence: AnswerEvidence[];
  history: { role: "user" | "assistant"; content: string }[];
}

export const answerSchema = z.object({
  answer: z
    .string()
    .min(1)
    .max(5000)
    .describe("Markdown. Put citation markers like [K2] right after the sentence they support."),
  cited_keys: z.array(z.string().max(12)).max(16),
  confidence: confidenceSchema,
  supported_by_sermon: z.boolean().describe("False when the evidence does not answer the question."),
  general_background: z
    .string()
    .max(1500)
    .nullable()
    .describe("Optional general context NOT from this sermon, clearly separate. Null when not needed."),
  follow_ups: z.array(z.string().max(160)).max(3),
});

export type Answer = z.infer<typeof answerSchema>;

const ANSWER_SYSTEM = `
You answer questions about one sermon using the listener's private study notebook. The evidence units (K1, K2, …) are excerpts retrieved from the sermon recording analysis, the listener's notes, photo transcriptions, and documents.

${VOICE_AND_TRUST_RULES}

Answering rules:
- Base every statement about the sermon on the evidence units, and put the matching marker (e.g. [K2]) right after the sentence it supports. List every key you used in cited_keys. Never cite a key that is not in the input.
- When the evidence does not answer the question, say so plainly ("I can't find where the sermon addresses that in your notebook.") and set supported_by_sermon to false. Do not fill the gap from memory.
- If brief general background would help (history, context, how Christians broadly understand a term), put it in general_background, clearly framed as general context rather than something this sermon said. Keep it neutral and short.
- When the listener's own notes are relevant, say so ("Your notes say…").
- For timing questions, refer to the times shown in the evidence labels; they are approximate.
- Keep answers focused: usually under 200 words. Study plans may be longer and should use short headed lists.
- confidence: high when the evidence directly answers, medium when it partly does, low when you are inferring.
`.trim();

export const answerQuestionPrompt: PromptDefinition<AnswerInput, typeof answerSchema> = {
  id: "qa-answer",
  version: "2026-09-28.1",
  tier: "synthesis",
  description: "Grounded Ask AI answer with key-based citations.",
  modelRequirements: "Faithful grounded QA over ~10k tokens of evidence; JSON schema output.",
  schema: answerSchema,
  options: { temperature: 0.2, maxOutputTokens: 4_000, thinking: "low", timeoutMs: 90_000 },
  build(input) {
    const overview = bullet([
      `Sermon: ${input.sermon.title || "Untitled"}${input.sermon.speaker ? ` — ${input.sermon.speaker}` : ""}`,
      input.overview.bigIdea ? `Big idea (AI summary, not evidence): ${input.overview.bigIdea}` : null,
      input.overview.mainIdeas.length ? `Main ideas (AI summary, not evidence): ${input.overview.mainIdeas.join("; ")}` : null,
      input.overview.scriptures.length ? `Scripture in this sermon: ${input.overview.scriptures.join(", ")}` : null,
    ]);
    const evidence = input.evidence.length
      ? input.evidence.map((e) => `[${e.key}] ${e.label}\n${e.text}`).join("\n\n")
      : "(No matching evidence was found in the notebook.)";
    const history = input.history.length
      ? `Earlier in this conversation:\n${input.history.map((h) => `${h.role === "user" ? "Listener" : "You"}: ${h.content.slice(0, 600)}`).join("\n")}`
      : null;
    return {
      system: ANSWER_SYSTEM,
      parts: [
        {
          type: "text",
          text: bullet([
            overview,
            "",
            "Evidence units:",
            evidence,
            "",
            history,
            `Question type: ${input.questionType}`,
            `Question: ${input.question}`,
          ]),
        },
      ],
    };
  },
};
