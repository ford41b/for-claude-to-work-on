import type { z } from "zod";
import type { ContentPart, GenerateRequest, ModelTier } from "@/lib/ai/types";

/**
 * A versioned prompt. Bump `version` whenever instructions or schema change; the version is
 * stored on every artifact and is part of the analysis cache key.
 */
export interface PromptDefinition<TInput, TSchema extends z.ZodType> {
  id: string;
  version: string;
  tier: ModelTier;
  /** What the prompt is for and what the model must be capable of. */
  description: string;
  modelRequirements: string;
  schema: TSchema;
  build(input: TInput): { system: string; parts: ContentPart[] };
  options?: Pick<GenerateRequest, "temperature" | "maxOutputTokens" | "mediaResolution" | "thinking" | "timeoutMs">;
}

export type PromptOutput<P> = P extends PromptDefinition<unknown, infer S> ? z.infer<S> : never;
