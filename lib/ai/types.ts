/**
 * Provider-neutral AI contracts. Product code depends on these types and on the task functions
 * in lib/ai/service.ts — never on a vendor SDK.
 */

export type ModelTier = "media" | "synthesis" | "fast";

export type ContentPart =
  | { type: "text"; text: string }
  /** A public YouTube URL the provider fetches itself. */
  | { type: "youtube"; url: string; fps?: number }
  /** Small media sent inline (photos, short PDFs). */
  | { type: "inline"; mimeType: string; data: Uint8Array }
  /** Media previously prepared with ModelProvider.prepareMedia. */
  | { type: "prepared"; ref: PreparedMedia; fps?: number };

export interface PreparedMedia {
  provider: string;
  uri: string;
  mimeType: string;
  /** Provider-specific handle used for cleanup. */
  handle: string;
  expiresAt?: string;
}

export interface GenerateRequest {
  tier: ModelTier;
  system: string;
  parts: ContentPart[];
  /** JSON Schema describing the required output (already sanitized for providers). */
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  mediaResolution?: "low" | "medium" | "high";
  thinking?: "minimal" | "low" | "medium" | "high";
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Identifies the prompt (and its structured input) — used for tracing and by the test fixture provider. */
  trace: { promptId: string; promptVersion: string; input?: unknown };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

export interface GenerateResponse {
  text: string;
  model: string;
  usage: TokenUsage;
  finishReason?: string;
  latencyMs: number;
}

export interface EmbedRequest {
  texts: string[];
  purpose: "document" | "query";
  signal?: AbortSignal;
}

export interface EmbedResponse {
  vectors: number[][];
  model: string;
  dimensions: number;
  usage: TokenUsage;
}

export interface MediaToPrepare {
  /** Absolute path to a local temporary file. */
  filePath: string;
  mimeType: string;
  displayName: string;
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
}

export type IntegrationState = "AVAILABLE" | "PREVIEW" | "UNAVAILABLE" | "DEPRECATED" | "DISABLED" | "ERROR";

export interface ModelProvider {
  readonly id: string;
  readonly label: string;
  modelFor(tier: ModelTier): string;
  readonly embeddingModel: string;
  readonly embeddingDimensions: number;
  /** Whether the provider can analyze a public YouTube URL directly. */
  readonly supportsYouTubeUrls: boolean;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  prepareMedia(input: MediaToPrepare): Promise<PreparedMedia>;
  releaseMedia(ref: PreparedMedia): Promise<void>;
}

export const EMBEDDING_DIMENSIONS = 768;
