import {
  ApiError,
  FileState,
  GoogleGenAI,
  MediaResolution,
  ThinkingLevel,
  type Part,
} from "@google/genai";
import { AIError, type AIErrorCode } from "@/lib/ai/errors";
import {
  EMBEDDING_DIMENSIONS,
  type ContentPart,
  type EmbedRequest,
  type EmbedResponse,
  type GenerateRequest,
  type GenerateResponse,
  type MediaToPrepare,
  type ModelProvider,
  type ModelTier,
  type PreparedMedia,
} from "@/lib/ai/types";

/**
 * Gemini adapter (Gemini Developer API via @google/genai). The only file in the codebase that
 * knows Gemini request/response shapes.
 *
 * Verified 2026-09-28: generateContent + responseJsonSchema, YouTube URL input (Preview; public
 * videos only), Files API (≤2 GB, 48 h retention), embedContent with outputDimensionality.
 */

export interface GeminiConfig {
  apiKey: string;
  models: Record<ModelTier, string>;
  embeddingModel: string;
}

const MEDIA_RESOLUTION: Record<NonNullable<GenerateRequest["mediaResolution"]>, MediaResolution> = {
  low: MediaResolution.MEDIA_RESOLUTION_LOW,
  medium: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
  high: MediaResolution.MEDIA_RESOLUTION_HIGH,
};

const THINKING: Record<NonNullable<GenerateRequest["thinking"]>, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function toPart(part: ContentPart): Part {
  switch (part.type) {
    case "text":
      return { text: part.text };
    case "youtube":
      return {
        fileData: { fileUri: part.url },
        ...(part.fps ? { videoMetadata: { fps: part.fps } } : {}),
      };
    case "inline":
      return { inlineData: { mimeType: part.mimeType, data: Buffer.from(part.data).toString("base64") } };
    case "prepared":
      return {
        fileData: { fileUri: part.ref.uri, mimeType: part.ref.mimeType },
        ...(part.fps ? { videoMetadata: { fps: part.fps } } : {}),
      };
  }
}

/** Maps Gemini API failures onto provider-neutral codes. */
export function classifyGeminiError(err: unknown, context: { hasYouTube: boolean }): AIError {
  if (err instanceof AIError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const status = err instanceof ApiError ? err.status : undefined;
  const detail = `${status ?? ""} ${message}`.trim().slice(0, 1000);

  if (err instanceof Error && (err.name === "AbortError" || lower.includes("timed out") || lower.includes("timeout"))) {
    return new AIError("timeout", { detail });
  }
  let code: AIErrorCode = "unavailable";
  if (status === 401 || (status === 403 && !context.hasYouTube) || lower.includes("api key not valid")) code = "auth_failed";
  else if (status === 429) code = lower.includes("quota") && lower.includes("exceeded") && lower.includes("per day") ? "quota_exceeded" : "rate_limited";
  else if (context.hasYouTube && (status === 400 || status === 403 || status === 404)) {
    if (/(private|unlisted|permission|not public|access)/.test(lower)) code = "media_private";
    else if (/(unavailable|not found|removed|does not exist|cannot be accessed|invalid video)/.test(lower)) code = "media_unavailable";
    else if (/(too long|exceeds|token count|context)/.test(lower)) code = "media_too_long";
    else code = "media_unavailable";
  } else if (status === 400 && /(token count|too long|exceeds the maximum)/.test(lower)) code = "media_too_long";
  else if (status === 400 && /(mime|unsupported|not supported)/.test(lower)) code = "media_unsupported";
  else if (status === 400) code = "invalid_output";
  else if (status && status >= 500) code = "unavailable";
  return new AIError(code, { detail });
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini";
  readonly label = "Google Gemini API";
  readonly supportsYouTubeUrls = true;
  readonly embeddingDimensions = EMBEDDING_DIMENSIONS;
  readonly embeddingModel: string;
  private readonly client: GoogleGenAI;
  private readonly models: Record<ModelTier, string>;

  constructor(config: GeminiConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.models = config.models;
    this.embeddingModel = config.embeddingModel;
  }

  modelFor(tier: ModelTier): string {
    return this.models[tier];
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const model = this.modelFor(req.tier);
    const hasYouTube = req.parts.some((p) => p.type === "youtube");
    const started = Date.now();
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: [{ role: "user", parts: req.parts.map(toPart) }],
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          responseJsonSchema: req.responseJsonSchema,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
          ...(req.mediaResolution ? { mediaResolution: MEDIA_RESOLUTION[req.mediaResolution] } : {}),
          ...(req.thinking ? { thinkingConfig: { thinkingLevel: THINKING[req.thinking] } } : {}),
          ...(req.signal ? { abortSignal: req.signal } : {}),
          httpOptions: {
            ...(req.timeoutMs ? { timeout: req.timeoutMs } : {}),
            // The job system owns retries; keep SDK-level retries minimal.
            retryOptions: { attempts: 2 },
          },
        },
      });
      const blockReason = response.promptFeedback?.blockReason;
      if (blockReason) throw new AIError("content_blocked", { detail: `blockReason=${blockReason}` });
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason ? String(candidate.finishReason) : undefined;
      if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT" || finishReason === "BLOCKLIST") {
        throw new AIError("content_blocked", { detail: `finishReason=${finishReason}` });
      }
      const text = response.text ?? "";
      if (!text.trim()) {
        throw new AIError("invalid_output", { detail: `empty response (finishReason=${finishReason ?? "none"})` });
      }
      const usage = response.usageMetadata;
      return {
        text,
        model: response.modelVersion ?? model,
        finishReason,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          thinkingTokens: usage?.thoughtsTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      };
    } catch (err) {
      throw classifyGeminiError(err, { hasYouTube });
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const vectors: number[][] = [];
    const batchSize = 50;
    try {
      for (let i = 0; i < req.texts.length; i += batchSize) {
        const batch = req.texts.slice(i, i + batchSize);
        const res = await this.client.models.embedContent({
          model: this.embeddingModel,
          contents: batch,
          config: {
            outputDimensionality: this.embeddingDimensions,
            taskType: req.purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
            ...(req.signal ? { abortSignal: req.signal } : {}),
          },
        });
        const embeddings = res.embeddings ?? [];
        if (embeddings.length !== batch.length) {
          throw new AIError("invalid_output", { detail: `expected ${batch.length} embeddings, got ${embeddings.length}` });
        }
        for (const e of embeddings) vectors.push(normalize(e.values ?? []));
      }
    } catch (err) {
      throw classifyGeminiError(err, { hasYouTube: false });
    }
    // Token counts are not returned by embedContent; estimate ~4 chars/token for cost tracking.
    const estimated = Math.ceil(req.texts.reduce((n, t) => n + t.length, 0) / 4);
    return {
      vectors,
      model: this.embeddingModel,
      dimensions: this.embeddingDimensions,
      usage: { inputTokens: estimated, outputTokens: 0, thinkingTokens: 0, totalTokens: estimated },
    };
  }

  async prepareMedia(input: MediaToPrepare): Promise<PreparedMedia> {
    try {
      input.onProgress?.("Uploading recording to the analysis service");
      let file = await this.client.files.upload({
        file: input.filePath,
        config: {
          mimeType: input.mimeType,
          displayName: input.displayName.slice(0, 100),
          ...(input.signal ? { abortSignal: input.signal } : {}),
        },
      });
      const deadline = Date.now() + 15 * 60_000;
      while (file.state === FileState.PROCESSING) {
        if (Date.now() > deadline) throw new AIError("timeout", { detail: "file processing exceeded 15 minutes" });
        input.onProgress?.("Waiting for the analysis service to process the recording");
        await new Promise((r) => setTimeout(r, 5000));
        file = await this.client.files.get({ name: file.name! });
      }
      if (file.state === FileState.FAILED || !file.uri || !file.name) {
        throw new AIError("media_unsupported", { detail: `file state ${file.state}: ${file.error?.message ?? ""}` });
      }
      return {
        provider: this.id,
        uri: file.uri,
        mimeType: file.mimeType ?? input.mimeType,
        handle: file.name,
        expiresAt: file.expirationTime,
      };
    } catch (err) {
      throw classifyGeminiError(err, { hasYouTube: false });
    }
  }

  async releaseMedia(ref: PreparedMedia): Promise<void> {
    try {
      await this.client.files.delete({ name: ref.handle });
    } catch {
      // Files expire automatically after 48 hours; deletion is best-effort.
    }
  }
}

function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? values.map((v) => v / norm) : values;
}
