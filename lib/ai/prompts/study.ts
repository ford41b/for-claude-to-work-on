import { z } from "zod";
import { lenientEnum, sourceKeysSchema } from "@/lib/ai/schema";
import { bullet, CITATION_RULES, VOICE_AND_TRUST_RULES } from "./shared";
import type { CatalogUnit } from "./sermon-pack";
import type { PromptDefinition } from "./types";

export const STUDY_FORMATS = [
  "five_minute",
  "fifteen_minute",
  "thirty_minute",
  "deep",
  "small_group",
  "youth",
  "personal",
  "family",
] as const;
export type StudyFormat = (typeof STUDY_FORMATS)[number];

export const STUDY_SECTION_KEYS = [
  "sermon_connection",
  "background",
  "observe",
  "interpret",
  "connect",
  "apply",
  "related_scriptures",
  "discussion_questions",
  "reflection",
  "prayer_prompt",
  "next_step",
] as const;
export type StudySectionKey = (typeof STUDY_SECTION_KEYS)[number];

export const STUDY_FORMAT_SPECS: Record<
  StudyFormat,
  { label: string; minutes: number; audience: string; sections: StudySectionKey[]; guidance: string }
> = {
  five_minute: {
    label: "5-minute",
    minutes: 5,
    audience: "one person with a few spare minutes",
    sections: ["sermon_connection", "observe", "apply", "prayer_prompt"],
    guidance: "Very short: one or two sentences per section, one observation question, one application.",
  },
  fifteen_minute: {
    label: "15-minute",
    minutes: 15,
    audience: "one person",
    sections: ["sermon_connection", "observe", "interpret", "apply", "reflection", "prayer_prompt", "next_step"],
    guidance: "Two or three questions in observe and interpret.",
  },
  thirty_minute: {
    label: "30-minute",
    minutes: 30,
    audience: "one person",
    sections: [
      "sermon_connection", "background", "observe", "interpret", "connect", "apply",
      "related_scriptures", "reflection", "prayer_prompt", "next_step",
    ],
    guidance: "Fuller study with three to four questions in the main sections.",
  },
  deep: {
    label: "Deep study",
    minutes: 60,
    audience: "a person studying carefully over an hour or more",
    sections: [
      "sermon_connection", "background", "observe", "interpret", "connect", "apply",
      "related_scriptures", "discussion_questions", "reflection", "prayer_prompt", "next_step",
    ],
    guidance: "Thorough. Background must be clearly framed as general context and note where interpretations differ.",
  },
  small_group: {
    label: "Small group",
    minutes: 45,
    audience: "a small group discussing together",
    sections: ["sermon_connection", "observe", "interpret", "discussion_questions", "apply", "prayer_prompt"],
    guidance: "Six to eight open discussion questions that invite different perspectives; include an easy opening question.",
  },
  youth: {
    label: "Student / youth",
    minutes: 20,
    audience: "teenagers",
    sections: ["sermon_connection", "observe", "interpret", "apply", "discussion_questions", "prayer_prompt"],
    guidance: "Plain language, concrete examples from school and friendships, no talking down.",
  },
  personal: {
    label: "Personal reflection",
    minutes: 20,
    audience: "one person reflecting privately",
    sections: ["sermon_connection", "observe", "reflection", "apply", "prayer_prompt", "next_step"],
    guidance: "Reflective, journaling-style questions.",
  },
  family: {
    label: "Family",
    minutes: 15,
    audience: "a family with children of mixed ages",
    sections: ["sermon_connection", "observe", "discussion_questions", "apply", "prayer_prompt"],
    guidance: "Simple words; questions a child can answer; one shared activity or next step.",
  },
};

export const studyGuideSchema = z.object({
  title: z.string().min(1).max(160),
  big_idea: z.string().min(1).max(600),
  primary_scripture: z.string().max(80).nullable().describe("Reference only, e.g. 'Romans 8:18–25'."),
  estimated_minutes: z.number().int().min(1).max(240),
  sections: z
    .array(
      z.object({
        key: lenientEnum(STUDY_SECTION_KEYS),
        heading: z.string().min(1).max(80),
        body: z.string().max(1800).describe("Short markdown paragraph(s). No verse text."),
        items: z.array(z.string().max(400)).max(10).describe("Questions, steps, or references for this section."),
        source_keys: sourceKeysSchema,
      }),
    )
    .min(1)
    .max(14),
});

export type StudyGuideDraft = z.infer<typeof studyGuideSchema>;

export interface StudyInput {
  format: StudyFormat;
  sermon: { title: string | null; speaker: string | null };
  bigIdea: string | null;
  mainIdeas: { title: string; summary: string }[];
  scriptures: { reference: string; role: string; context: string }[];
  applications: string[];
  units: CatalogUnit[];
}

const SYSTEM = `
You write a Bible study that helps someone go deeper into a sermon they heard. It is built from their Sermon Pack and evidence units from the sermon, their notes, and photos.

${VOICE_AND_TRUST_RULES}

${CITATION_RULES}

Study rules:
- Follow the requested sections in order and fit the stated length and audience.
- "sermon_connection" explains what the sermon said about the passage, attributed to the sermon, with citations.
- "background" is general historical or literary context, clearly framed as such ("Many scholars note…"), never as something the sermon said, and without source keys unless the sermon itself gave that background.
- "observe" asks what the text says; "interpret" asks what it means, acknowledging where Christians read it differently; "apply" offers practical options, never commands or guilt.
- Refer to passages by reference only. The reader will open their own Bible — never write verse text.
- Questions are open-ended and never test or judge the reader's faith.
`.trim();

export const studyPrompt: PromptDefinition<StudyInput, typeof studyGuideSchema> = {
  id: "bible-study",
  version: "2026-09-28.1",
  tier: "synthesis",
  description: "Format-specific Bible study grounded in the Sermon Pack.",
  modelRequirements: "Good instruction following for structured educational writing; JSON schema output.",
  schema: studyGuideSchema,
  options: { temperature: 0.4, maxOutputTokens: 12_000, thinking: "low", timeoutMs: 3 * 60_000 },
  build(input) {
    const spec = STUDY_FORMAT_SPECS[input.format];
    const pack = bullet([
      `Sermon: ${input.sermon.title || "Untitled"}${input.sermon.speaker ? ` — ${input.sermon.speaker}` : ""}`,
      input.bigIdea ? `Big idea: ${input.bigIdea}` : null,
      input.mainIdeas.length ? `Main ideas:\n${input.mainIdeas.map((m) => `- ${m.title}: ${m.summary}`).join("\n")}` : null,
      input.scriptures.length
        ? `Scripture used (by reference):\n${input.scriptures.map((s) => `- ${s.reference} (${s.role})${s.context ? `: ${s.context}` : ""}`).join("\n")}`
        : "No Scripture passages were identified.",
      input.applications.length ? `Applications the sermon suggested:\n${input.applications.map((a) => `- ${a}`).join("\n")}` : null,
    ]);
    const units = input.units.map((u) => bullet([`[${u.key}] ${u.label}`, u.text])).join("\n\n");
    return {
      system: SYSTEM,
      parts: [
        {
          type: "text",
          text: bullet([
            `Format: ${spec.label} (about ${spec.minutes} minutes) for ${spec.audience}.`,
            `Sections, in order: ${spec.sections.join(", ")}.`,
            spec.guidance,
            "",
            pack,
            "",
            "Evidence units:",
            units || "(none)",
            "",
            "Write the study.",
          ]),
        },
      ],
    };
  },
};
