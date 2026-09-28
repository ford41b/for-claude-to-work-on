import { AIError } from "@/lib/ai/errors";
import { addUsage } from "@/lib/ai/pricing";
import type { PromptDefinition } from "@/lib/ai/prompts/types";
import { toProviderSchema } from "@/lib/ai/schema";
import type { ModelProvider, TokenUsage } from "@/lib/ai/types";
import type { z } from "zod";

export interface PromptRun<T> {
  output: T;
  model: string;
  provider: string;
  promptId: string;
  promptVersion: string;
  usage: TokenUsage;
  latencyMs: number;
  repaired: boolean;
}

/** Extracts a JSON value from model text (tolerates code fences and leading prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? fenced[1]! : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("no JSON found");
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 30)
    .map((i) => `- at ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

/**
 * Runs a versioned prompt and returns schema-validated output. On invalid JSON or schema
 * violations it performs one repair pass with the fast tier; if that fails it throws a
 * retryable `invalid_output` error so the job system retries later. Raw model JSON is never
 * trusted without validation.
 */
export async function runPrompt<TInput, TSchema extends z.ZodType>(
  provider: ModelProvider,
  def: PromptDefinition<TInput, TSchema>,
  input: TInput,
  options: { signal?: AbortSignal; traceInput?: unknown } = {},
): Promise<PromptRun<z.infer<TSchema>>> {
  const { system, parts } = def.build(input);
  const responseJsonSchema = toProviderSchema(def.schema);
  const trace = { promptId: def.id, promptVersion: def.version, input: options.traceInput ?? input };

  const first = await provider.generate({
    tier: def.tier,
    system,
    parts,
    responseJsonSchema,
    ...def.options,
    signal: options.signal,
    trace,
  });

  let parsed: unknown;
  let parseError: string | null = null;
  try {
    parsed = extractJson(first.text);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  if (parseError === null) {
    const result = def.schema.safeParse(parsed);
    if (result.success) {
      return {
        output: result.data,
        model: first.model,
        provider: provider.id,
        promptId: def.id,
        promptVersion: def.version,
        usage: first.usage,
        latencyMs: first.latencyMs,
        repaired: false,
      };
    }
    parseError = describeIssues(result.error);
  }

  // One repair pass: show the model its output and the violations.
  const repair = await provider.generate({
    tier: "fast",
    system:
      "You repair JSON so it satisfies a JSON Schema. Keep every value that is already valid. " +
      "Do not invent new facts: when a required value is missing, use null, an empty string, or an empty array as the schema allows. " +
      "Return only the corrected JSON.",
    parts: [
      {
        type: "text",
        text: `Problems found:\n${parseError}\n\nJSON to repair:\n${first.text.slice(0, 200_000)}`,
      },
    ],
    responseJsonSchema,
    temperature: 0,
    signal: options.signal,
    trace: { promptId: `${def.id}:repair`, promptVersion: def.version, input: trace.input },
  });
  const usage = addUsage(first.usage, repair.usage);
  try {
    const result = def.schema.safeParse(extractJson(repair.text));
    if (result.success) {
      return {
        output: result.data,
        model: first.model,
        provider: provider.id,
        promptId: def.id,
        promptVersion: def.version,
        usage,
        latencyMs: first.latencyMs + repair.latencyMs,
        repaired: true,
      };
    }
    throw new AIError("invalid_output", { detail: `schema violations after repair:\n${describeIssues(result.error)}` });
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError("invalid_output", { detail: `unparseable JSON after repair: ${String(err)}` });
  }
}
