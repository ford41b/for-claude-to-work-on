import { z } from "zod";
import { confidenceSchema, lenientEnum, lenientUpperEnum } from "@/lib/ai/schema";
import type { ContentPart, PreparedMedia } from "@/lib/ai/types";
import { bullet, timestampString } from "./shared";
import type { PromptDefinition } from "./types";

/**
 * Canonical media analysis: run ONCE per recording (cached by content hash + prompt version).
 * Produces a timestamped evidence log that every later step reuses instead of the video.
 */

export const SEGMENT_KINDS = [
  "INTRODUCTION", "CONTEXT", "MAIN_POINT", "SCRIPTURE", "ILLUSTRATION", "QUOTE",
  "QUESTION", "APPLICATION", "PRAYER", "CONCLUSION", "OTHER",
] as const;

const guess = z.object({
  value: z.string().max(200).nullable(),
  confidence: confidenceSchema,
  basis: z.string().max(200).nullable().describe("Where this came from, e.g. 'title slide at 0:45' or 'speaker introduces himself'"),
});

export const mediaAnalysisSchema = z.object({
  is_sermon: z.boolean().describe("False when the recording is not a sermon/teaching or has no speech."),
  content_note: z.string().max(500).nullable().describe("Anything the reader should know, e.g. 'Worship music until 24:10; sermon begins there.'"),
  language: z.string().max(20).nullable(),
  duration: timestampString.nullable(),
  sermon_start: timestampString.nullable(),
  sermon_end: timestampString.nullable(),
  metadata: z.object({
    title: guess,
    speaker: guess,
    church: guess,
    series: guess,
    date: guess.describe("ISO date YYYY-MM-DD only if stated or shown"),
  }),
  segments: z
    .array(
      z.object({
        start: timestampString,
        end: timestampString,
        kind: lenientUpperEnum(SEGMENT_KINDS),
        summary: z.string().min(1).max(900).describe("What the speaker says in this span, attributed to the speaker, 1–3 sentences."),
        key_phrases: z.array(z.string().max(160)).max(4).describe("Short phrases heard clearly and word-for-word. Empty when unsure."),
        scripture_mentions: z.array(z.string().max(120)).max(6).describe("References as spoken or shown, e.g. 'Romans chapter 8 verse 28'. No verse text."),
        on_screen_text: z.string().max(500).nullable().describe("Slide or caption text visible in this span. Null for audio-only."),
        timing_confidence: confidenceSchema,
      }),
    )
    .max(150),
  quotes: z
    .array(
      z.object({
        text: z.string().min(1).max(600),
        at: timestampString,
        heard_verbatim: z.boolean().describe("True only when you are confident these are the exact words."),
        confidence: confidenceSchema,
      }),
    )
    .max(20),
  illustrations: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().max(600),
        kind: lenientEnum(["story", "example", "analogy", "personal", "historical", "other"] as const),
        start: timestampString,
        end: timestampString.nullable(),
      }),
    )
    .max(20),
});

export type MediaAnalysis = z.infer<typeof mediaAnalysisSchema>;

export interface MediaAnalysisInput {
  media: { kind: "youtube"; url: string } | { kind: "prepared"; ref: PreparedMedia };
  audioOnly: boolean;
  known: { title?: string | null; channel?: string | null; durationSeconds?: number | null };
}

const SYSTEM = `
You analyze a recording of a Christian sermon or Bible teaching for a private study notebook kept by someone who listened to it. Your output is evidence that later steps rely on, so accuracy matters more than completeness.

Rules:
1. Report only what is said or shown in the recording. Never add facts, names, Bible verses, or quotes that are not in it.
2. Attribute content to the speaker ("The speaker explains…", "The speaker argues…"). Do not restate interpretations as settled fact.
3. Timestamps are positions in this recording as MM:SS or H:MM:SS. They are approximate; set timing_confidence to "low" when unsure. Never invent precision.
4. Segments cover the preaching from start to end, in order, each roughly 45–150 seconds, split at natural topic changes. Skip long music, announcements, and offering, and mention them in content_note. Set sermon_start and sermon_end to where the preaching begins and ends.
5. key_phrases: only short phrases you heard clearly and are sure are word-for-word. When unsure, leave the list empty.
6. quotes: notable statements. heard_verbatim is true only when you are confident the words are exact; otherwise false and the statement will be treated as a paraphrase.
7. scripture_mentions: write references as spoken or shown ("Romans chapter eight", "John 3:16"), including stories named without a reference ("the prodigal son"). Never write out verse text.
8. metadata: fill only from what is said or shown (title slide, introductions, captions). Use null when unknown.
9. If the recording is not a sermon or teaching, or has no speech, set is_sermon to false, explain in content_note, and return empty lists.
`.trim();

export const sermonAnalysisPrompt: PromptDefinition<MediaAnalysisInput, typeof mediaAnalysisSchema> = {
  id: "sermon-analysis",
  version: "2026-09-28.1",
  tier: "media",
  description: "Timestamped evidence log of a sermon recording (YouTube URL or uploaded media).",
  modelRequirements: "Native video+audio understanding, ≥1M-token context for 90-minute recordings, JSON schema output.",
  schema: mediaAnalysisSchema,
  options: { temperature: 0.2, maxOutputTokens: 32_000, mediaResolution: "low", thinking: "low", timeoutMs: 12 * 60_000 },
  build(input) {
    const mediaPart: ContentPart =
      input.media.kind === "youtube"
        ? { type: "youtube", url: input.media.url, fps: input.audioOnly ? undefined : 0.5 }
        : { type: "prepared", ref: input.media.ref, fps: input.audioOnly ? undefined : 0.5 };
    const known = bullet([
      input.known.title ? `- Title (from the video page, may differ from the sermon title): ${input.known.title}` : null,
      input.known.channel ? `- Channel: ${input.known.channel}` : null,
      input.known.durationSeconds ? `- Duration: about ${Math.round(input.known.durationSeconds / 60)} minutes` : null,
    ]);
    return {
      system: SYSTEM,
      parts: [
        mediaPart,
        {
          type: "text",
          text: bullet([
            input.audioOnly ? "This is an audio-only recording: set on_screen_text to null everywhere." : null,
            known ? `Known information (may be incomplete):\n${known}` : null,
            "Analyze the recording above and return the evidence log.",
          ]),
        },
      ],
    };
  },
};
