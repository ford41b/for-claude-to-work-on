import { z } from "zod";
import { confidenceSchema, lenientEnum } from "@/lib/ai/schema";
import { bullet } from "./shared";
import type { PromptDefinition } from "./types";

export const photoAnalysisSchema = z.object({
  photo_kind: lenientEnum(["slide", "handwriting", "handout", "screenshot", "bulletin", "whiteboard", "other"] as const),
  title: z.string().max(300).nullable().describe("Slide or page title if one is visible."),
  contains_handwriting: z.boolean(),
  blocks: z
    .array(
      z.object({
        type: lenientEnum(["heading", "paragraph", "list_item", "scripture", "diagram", "other"] as const),
        text: z.string().max(3000).describe("Exact transcription. Put [unclear] where words cannot be read."),
        confidence: confidenceSchema,
        unclear: z.boolean().describe("True when any part of this block could not be read with confidence."),
      }),
    )
    .max(120),
  overall_confidence: confidenceSchema,
  legibility_note: z.string().max(400).nullable().describe("e.g. 'Glare across the bottom third; two words unreadable.'"),
  scripture_mentions: z.array(z.string().max(120)).max(30).describe("Bible references visible in the image, as written."),
});

export type PhotoAnalysis = z.infer<typeof photoAnalysisSchema>;

export interface PhotoAnalysisInput {
  image: { mimeType: string; data: Uint8Array };
  sermonTitle?: string | null;
}

const SYSTEM = `
You transcribe a photo that someone took during or after a sermon: a projected slide, handwritten notes, a printed handout or bulletin, a whiteboard, or a screenshot.

Rules:
1. Transcribe exactly what is written, keeping its structure: headings, paragraphs, and list items as separate blocks, in reading order.
2. Never guess. Where a word or line cannot be read, write [unclear] in its place, set unclear to true for that block, and lower its confidence. Do not fill gaps with plausible words.
3. Keep the original wording and spelling. Do not summarize, correct, or add anything.
4. Describe a diagram or drawing briefly in a block of type "diagram" (e.g. "Diagram: three circles labeled …").
5. Put Bible references exactly as written in scripture_mentions. Never write out verse text that is not in the image.
6. Mention problems such as blur, glare, cropping, low contrast, or angled text in legibility_note, and set overall_confidence accordingly.
7. If the image contains no text, return no blocks and explain in legibility_note.
`.trim();

export const imageAnalysisPrompt: PromptDefinition<PhotoAnalysisInput, typeof photoAnalysisSchema> = {
  id: "image-analysis",
  version: "2026-09-28.1",
  tier: "media",
  description: "OCR + structure of a sermon-related photo (slide, handwriting, handout).",
  modelRequirements: "Image understanding with handwriting OCR, JSON schema output.",
  schema: photoAnalysisSchema,
  options: { temperature: 0, maxOutputTokens: 8_000, mediaResolution: "high", thinking: "low", timeoutMs: 120_000 },
  build(input) {
    return {
      system: SYSTEM,
      parts: [
        { type: "inline", mimeType: input.image.mimeType, data: input.image.data },
        {
          type: "text",
          text: bullet([
            input.sermonTitle ? `This photo belongs to notes for a sermon titled "${input.sermonTitle}".` : null,
            "Transcribe the photo above.",
          ]),
        },
      ],
    };
  },
};

/** Joins transcription blocks into plain text, preserving structure. */
export function photoFullText(analysis: Pick<PhotoAnalysis, "title" | "blocks">): string {
  const lines: string[] = [];
  if (analysis.title) lines.push(analysis.title);
  for (const b of analysis.blocks) {
    if (!b.text.trim()) continue;
    if (analysis.title && b.type === "heading" && b.text.trim() === analysis.title.trim()) continue;
    lines.push(b.type === "list_item" ? `• ${b.text.trim()}` : b.text.trim());
  }
  return lines.join("\n");
}
