import type { TokenUsage } from "@/lib/ai/types";

/**
 * List prices in USD per 1M tokens, verified 2026-09-28 where marked. Unknown models return
 * null rather than a guessed number. Update alongside model changes.
 */
const PRICES: Record<string, { input: number; output: number; note: string }> = {
  // Standard price effective 2027-01-01; introductory $0.75/$3.75 until 2026-12-31.
  "gemini-3.8-flash": { input: 1.5, output: 7.5, note: "verified 2026-09-28 (standard list price)" },
  "gemini-3.1-pro-preview": { input: 2, output: 12, note: "verified 2026-09-28" },
  "gemini-embedding-001": { input: 0.15, output: 0, note: "list price" },
};

export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`) || model.endsWith(`/${k}`));
  if (!key) return null;
  const p = PRICES[key]!;
  const cost = (usage.inputTokens * p.input + (usage.outputTokens + usage.thinkingTokens) * p.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    thinkingTokens: a.thinkingTokens + b.thinkingTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 };
