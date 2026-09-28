import { z } from "zod";
import { confidenceSchema } from "@/lib/ai/schema";
import type { ContentPart } from "@/lib/ai/types";
import type { PromptDefinition } from "./types";

export const MAX_DOCUMENT_PAGES = 30;

export const documentAnalysisSchema = z.object({
  title: z.string().max(300).nullable(),
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1),
        text: z.string().max(12_000).describe("Faithful text of the page. [unclear] where unreadable."),
        headings: z.array(z.string().max(200)).max(20),
      }),
    )
    .max(MAX_DOCUMENT_PAGES),
  scripture_mentions: z.array(z.string().max(120)).max(60),
  overall_confidence: confidenceSchema,
  note: z.string().max(400).nullable(),
});

export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

export interface DocumentAnalysisInput {
  document: { mimeType: string; data: Uint8Array };
}

const SYSTEM = `
You extract the text of a document connected to a sermon: a handout, sermon notes, a study guide, or a bulletin.

Rules:
1. Return the text of each page faithfully, in reading order, keeping headings and list structure (one list item per line, starting with "• ").
2. Never summarize, paraphrase, or add content. Where text cannot be read, write [unclear].
3. List Bible references exactly as written in scripture_mentions. Never write out verse text that is not in the document.
4. Extract at most ${MAX_DOCUMENT_PAGES} pages; if the document is longer, say so in note.
`.trim();

export const documentAnalysisPrompt: PromptDefinition<DocumentAnalysisInput, typeof documentAnalysisSchema> = {
  id: "document-analysis",
  version: "2026-09-28.1",
  tier: "media",
  description: "Faithful per-page text extraction of a PDF handout.",
  modelRequirements: "Native PDF understanding, JSON schema output.",
  schema: documentAnalysisSchema,
  options: { temperature: 0, maxOutputTokens: 60_000, thinking: "minimal", timeoutMs: 5 * 60_000 },
  build(input) {
    const parts: ContentPart[] = [
      { type: "inline", mimeType: input.document.mimeType, data: input.document.data },
      { type: "text", text: "Extract the document above." },
    ];
    return { system: SYSTEM, parts };
  },
};
