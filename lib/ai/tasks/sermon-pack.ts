import { addUsage } from "@/lib/ai/pricing";
import {
  SERMON_PACK_PROMPT_VERSION,
  sermonPackPrompts,
  sermonPackSchema,
  type SermonPackDraft,
  type SermonPackInput,
} from "@/lib/ai/prompts/sermon-pack";
import { runPrompt, type PromptRun } from "@/lib/ai/structured";
import type { ModelProvider } from "@/lib/ai/types";

/**
 * Builds the Sermon Pack from its two part prompts, run at the same time. If one part fails,
 * the other is cancelled and the error is the failing part's.
 */
export async function runSermonPack(
  provider: ModelProvider,
  input: SermonPackInput,
  options: { signal?: AbortSignal } = {},
): Promise<PromptRun<SermonPackDraft>> {
  const controller = new AbortController();
  const forward = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forward();
  options.signal?.addEventListener("abort", forward, { once: true });
  const cancelOthersOnFailure = <T>(p: Promise<T>) =>
    p.catch((err: unknown) => {
      controller.abort(err);
      throw err;
    });
  try {
    const [core, details] = await Promise.all([
      cancelOthersOnFailure(runPrompt(provider, sermonPackPrompts.core, input, { signal: controller.signal })),
      cancelOthersOnFailure(runPrompt(provider, sermonPackPrompts.details, input, { signal: controller.signal })),
    ]);
    return {
      output: sermonPackSchema.parse({ ...core.output, ...details.output }),
      model: core.model,
      provider: provider.id,
      promptId: "sermon-pack",
      promptVersion: SERMON_PACK_PROMPT_VERSION,
      usage: addUsage(core.usage, details.usage),
      latencyMs: Math.max(core.latencyMs, details.latencyMs),
      repaired: core.repaired || details.repaired,
    };
  } finally {
    options.signal?.removeEventListener("abort", forward);
  }
}
