import { getModelProvider } from "@/lib/ai/registry";
import { runPrompt } from "@/lib/ai/structured";
import { runSermonPack } from "@/lib/ai/tasks/sermon-pack";
import { documentAnalysisPrompt, type DocumentAnalysisInput } from "@/lib/ai/prompts/document-analysis";
import { imageAnalysisPrompt, type PhotoAnalysisInput } from "@/lib/ai/prompts/image-analysis";
import { answerQuestionPrompt, classifyQuestionPrompt, type AnswerInput } from "@/lib/ai/prompts/qa";
import { sermonAnalysisPrompt, type MediaAnalysisInput } from "@/lib/ai/prompts/sermon-analysis";
import { sermonPackPrompts, type SermonPackInput } from "@/lib/ai/prompts/sermon-pack";
import { studyPrompt, type StudyInput } from "@/lib/ai/prompts/study";
import type { MediaToPrepare, PreparedMedia } from "@/lib/ai/types";

/**
 * The product's AI surface (§59). Every method runs a versioned prompt through the configured
 * provider and returns schema-validated output plus provider/model/prompt/usage metadata.
 */
export const sermonAI = {
  analyzeVideo(input: MediaAnalysisInput, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), sermonAnalysisPrompt, input, { signal, traceInput: input });
  },
  analyzeAudio(input: MediaAnalysisInput, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), sermonAnalysisPrompt, { ...input, audioOnly: true }, { signal, traceInput: input });
  },
  analyzeImage(input: PhotoAnalysisInput, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), imageAnalysisPrompt, input, {
      signal,
      traceInput: { sermonTitle: input.sermonTitle, bytes: input.image.data.byteLength },
    });
  },
  analyzeDocument(input: DocumentAnalysisInput, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), documentAnalysisPrompt, input, {
      signal,
      traceInput: { bytes: input.document.data.byteLength },
    });
  },
  buildSermonPack(input: SermonPackInput, signal?: AbortSignal) {
    return runSermonPack(getModelProvider(), input, { signal });
  },
  classifyQuestion(question: string, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), classifyQuestionPrompt, { question }, { signal });
  },
  answerQuestion(input: AnswerInput, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), answerQuestionPrompt, input, { signal });
  },
  generateStudy(input: StudyInput, signal?: AbortSignal) {
    return runPrompt(getModelProvider(), studyPrompt, input, { signal });
  },
  async embed(texts: string[], purpose: "document" | "query", signal?: AbortSignal) {
    const provider = getModelProvider();
    return provider.embed({ texts, purpose, signal });
  },
  prepareMedia(input: MediaToPrepare): Promise<PreparedMedia> {
    return getModelProvider().prepareMedia(input);
  },
  releaseMedia(ref: PreparedMedia): Promise<void> {
    return getModelProvider().releaseMedia(ref);
  },
  providerInfo() {
    const p = getModelProvider();
    return { id: p.id, label: p.label, supportsYouTubeUrls: p.supportsYouTubeUrls };
  },
};

export const PROMPT_REGISTRY = [
  sermonAnalysisPrompt,
  imageAnalysisPrompt,
  documentAnalysisPrompt,
  sermonPackPrompts.core,
  sermonPackPrompts.details,
  classifyQuestionPrompt,
  answerQuestionPrompt,
  studyPrompt,
];
