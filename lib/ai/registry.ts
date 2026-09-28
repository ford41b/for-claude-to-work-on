import "server-only";
import { serverEnv } from "@/lib/config/env";
import { AIError } from "@/lib/ai/errors";
import { FixtureProvider } from "@/lib/ai/providers/fixture";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import type { ModelProvider } from "@/lib/ai/types";

let cached: ModelProvider | null | undefined;

/**
 * Returns the configured model provider. Adding another provider (OpenAI, Anthropic, …) means
 * implementing ModelProvider in lib/ai/providers/<name> and selecting it here — no product
 * code changes. Throws `not_configured` when AI is disabled; callers degrade gracefully.
 */
export function getModelProvider(): ModelProvider {
  if (cached === undefined) {
    const env = serverEnv();
    switch (env.aiProvider) {
      case "gemini":
        cached = new GeminiProvider({
          apiKey: env.GEMINI_API_KEY!,
          models: {
            media: env.GEMINI_MODEL_MEDIA,
            synthesis: env.GEMINI_MODEL_SYNTHESIS,
            fast: env.GEMINI_MODEL_FAST,
          },
          embeddingModel: env.GEMINI_EMBEDDING_MODEL,
        });
        break;
      case "fixture":
        cached = new FixtureProvider();
        break;
      default:
        cached = null;
    }
  }
  if (!cached) throw new AIError("not_configured");
  return cached;
}

export function isAIConfigured(): boolean {
  return serverEnv().aiProvider !== "none";
}

export function isFixtureAI(): boolean {
  return serverEnv().aiProvider === "fixture";
}

/** For tests only. */
export function setModelProviderForTests(provider: ModelProvider | null | undefined) {
  cached = provider;
}
