import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { AIError } from "@/lib/ai/errors";
import { answerSchema } from "@/lib/ai/prompts/qa";
import { mediaAnalysisSchema } from "@/lib/ai/prompts/sermon-analysis";
import { sermonPackPrompt, sermonPackSchema } from "@/lib/ai/prompts/sermon-pack";
import { PROMPT_REGISTRY } from "@/lib/ai/service";
import { toProviderSchema } from "@/lib/ai/schema";
import { extractJson, runPrompt } from "@/lib/ai/structured";
import { classifyGeminiError } from "@/lib/ai/providers/gemini";
import { FixtureProvider } from "@/lib/ai/providers/fixture";
import type { GenerateRequest, GenerateResponse, ModelProvider } from "@/lib/ai/types";

const ALLOWED = new Set(["type", "properties", "required", "items", "enum", "description", "anyOf", "minItems", "maxItems", "minimum", "maximum", "format", "title", "nullable", "propertyOrdering"]);

function collectKeys(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectKeys(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k !== "properties") out.add(k);
      if (k === "properties") Object.values(v as object).forEach((p) => collectKeys(p, out));
      else collectKeys(v, out);
    }
  }
  return out;
}

class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly label = "scripted";
  readonly supportsYouTubeUrls = false;
  readonly embeddingModel = "x";
  readonly embeddingDimensions = 768;
  calls: GenerateRequest[] = [];
  constructor(private responses: string[]) {}
  modelFor() {
    return "scripted-model";
  }
  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    this.calls.push(req);
    const text = this.responses.shift() ?? "";
    return { text, model: "scripted-model", latencyMs: 1, usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0, totalTokens: 15 } };
  }
  async embed(): Promise<never> {
    throw new Error("n/a");
  }
  async prepareMedia(): Promise<never> {
    throw new Error("n/a");
  }
  async releaseMedia() {}
}

const validAnswer = { answer: "Yes [K1].", cited_keys: ["K1"], confidence: "high", supported_by_sermon: true, general_background: null, follow_ups: [] };
const answerPrompt = PROMPT_REGISTRY.find((p) => p.id === "qa-answer")!;
const answerInput = { question: "q", questionType: "sermon_content", sermon: { title: null, speaker: null }, overview: { bigIdea: null, mainIdeas: [], scriptures: [] }, evidence: [], history: [] } as const;

describe("provider schemas", () => {
  it.each(PROMPT_REGISTRY.map((p) => [p.id, p] as const))("%s uses only provider-supported JSON Schema keywords", (_id, prompt) => {
    const schema = toProviderSchema(prompt.schema);
    for (const key of collectKeys(schema)) expect(ALLOWED.has(key), key).toBe(true);
    expect(schema.type).toBe("object");
  });

  it("every prompt is versioned and documents model requirements", () => {
    for (const p of PROMPT_REGISTRY) {
      expect(p.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(p.modelRequirements.length).toBeGreaterThan(10);
    }
    expect(new Set(PROMPT_REGISTRY.map((p) => p.id)).size).toBe(PROMPT_REGISTRY.length);
  });
});

describe("schemas are lenient on case but strict on shape", () => {
  it("normalizes enum case", () => {
    const r = answerSchema.parse({ ...validAnswer, confidence: "High" });
    expect(r.confidence).toBe("high");
  });
  it("rejects invalid timestamps in media analysis", () => {
    const bad = mediaAnalysisSchema.safeParse({
      is_sermon: true, content_note: null, language: null, duration: "forever", sermon_start: null, sermon_end: null,
      metadata: { title: { value: null, confidence: "low", basis: null }, speaker: { value: null, confidence: "low", basis: null }, church: { value: null, confidence: "low", basis: null }, series: { value: null, confidence: "low", basis: null }, date: { value: null, confidence: "low", basis: null } },
      segments: [], quotes: [], illustrations: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe("runPrompt", () => {
  it("returns validated output on the first try", async () => {
    const provider = new ScriptedProvider([JSON.stringify(validAnswer)]);
    const run = await runPrompt(provider, answerPrompt as never, answerInput);
    expect(run.repaired).toBe(false);
    expect(run.output).toMatchObject({ cited_keys: ["K1"] });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.responseJsonSchema.type).toBe("object");
  });

  it("tolerates code fences", () => {
    expect(extractJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(extractJson("Here you go: {\"a\":2} thanks")).toEqual({ a: 2 });
  });

  it("repairs invalid output once", async () => {
    const provider = new ScriptedProvider(['{"answer": "x"}', JSON.stringify(validAnswer)]);
    const run = await runPrompt(provider, answerPrompt as never, answerInput);
    expect(run.repaired).toBe(true);
    expect(run.usage.totalTokens).toBe(30);
    expect(provider.calls[1]!.tier).toBe("fast");
  });

  it("throws a retryable invalid_output error when repair fails", async () => {
    const provider = new ScriptedProvider(["not json", "still not json"]);
    await expect(runPrompt(provider, answerPrompt as never, answerInput)).rejects.toMatchObject({ code: "invalid_output", retryable: true });
  });
});

describe("fixture provider", () => {
  it("produces a schema-valid Sermon Pack that cites only provided keys", async () => {
    const provider = new FixtureProvider();
    const input = {
      sermon: { title: null, speaker: null, church: null, series: null, date: null, userSetFields: [] },
      hasRecording: true,
      recordingNote: null,
      units: [
        { key: "V1", kind: "segment" as const, label: "Sermon ~0:45–3:05", text: "The speaker introduces waiting.", details: ["Kind: INTRODUCTION"] },
        { key: "V2", kind: "segment" as const, label: "Sermon ~8:30–14:00", text: "First point: waiting is not wasted.", details: ["Kind: MAIN_POINT", 'Heard word-for-word: "waiting is not wasted"'] },
        { key: "N1", kind: "note" as const, label: "Your note", text: "God is working while I wait" },
      ],
      detectedScripture: [{ reference: "Romans 8:24–25", kind: "explicit", keys: ["V2"] }],
    };
    const run = await runPrompt(provider, sermonPackPrompt, input);
    const parsed = sermonPackSchema.parse(run.output);
    const keys = new Set(input.units.map((u) => u.key));
    const cited = JSON.stringify(parsed).match(/"source_keys":\[[^\]]*\]/g)!.flatMap((m) => JSON.parse(m.slice(14)) as string[]);
    for (const k of cited) expect(keys.has(k)).toBe(true);
  });
});

describe("classifyGeminiError", () => {
  const api = (status: number, message: string) => new ApiError({ status, message });
  it("maps YouTube access failures to non-retryable media errors", () => {
    expect(classifyGeminiError(api(403, "The caller does not have permission to access this private video"), { hasYouTube: true }).code).toBe("media_private");
    expect(classifyGeminiError(api(400, "Video unavailable"), { hasYouTube: true }).code).toBe("media_unavailable");
    expect(classifyGeminiError(api(400, "Video unavailable"), { hasYouTube: true }).retryable).toBe(false);
  });
  it("does not blame the video for our own configuration or request problems", () => {
    const yt = { hasYouTube: true };
    expect(classifyGeminiError(api(404, "models/gemini-9-flash is not found for API version v1beta, or is not supported for generateContent."), yt).code).toBe("model_not_found");
    expect(classifyGeminiError(api(400, "Invalid JSON payload received. Unknown name \"thinkingLevel\""), yt).code).toBe("request_rejected");
    expect(classifyGeminiError(api(400, "Request contains an invalid argument."), yt).code).toBe("request_rejected");
    expect(classifyGeminiError(api(403, "Method doesn't allow unregistered callers. Please use API Key."), yt).code).toBe("auth_failed");
    expect(classifyGeminiError(api(400, "The input token count (1200000) exceeds the maximum number of tokens allowed (1048576)."), yt).code).toBe("media_too_long");
  });
  it("maps rate limits, outages, and auth", () => {
    expect(classifyGeminiError(api(429, "Resource has been exhausted"), { hasYouTube: false })).toMatchObject({ code: "rate_limited", retryable: true });
    expect(classifyGeminiError(api(503, "The model is overloaded"), { hasYouTube: false })).toMatchObject({ code: "unavailable", retryable: true });
    expect(classifyGeminiError(api(401, "API key not valid"), { hasYouTube: false })).toMatchObject({ code: "auth_failed", retryable: false });
    expect(classifyGeminiError(new AIError("content_blocked"), { hasYouTube: false }).code).toBe("content_blocked");
  });
});
