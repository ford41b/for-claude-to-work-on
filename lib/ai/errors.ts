/**
 * AI failures, classified so the job system can decide whether to retry and the UI can offer
 * the right fallback. `message` is safe to show users; `detail` goes to job logs only.
 */
export type AIErrorCode =
  | "not_configured"
  | "unavailable"
  | "rate_limited"
  | "quota_exceeded"
  | "auth_failed"
  | "invalid_output"
  | "content_blocked"
  | "media_private"
  | "media_unavailable"
  | "media_unsupported"
  | "media_too_long"
  | "timeout";

const RETRYABLE: Record<AIErrorCode, boolean> = {
  not_configured: false,
  unavailable: true,
  rate_limited: true,
  quota_exceeded: false,
  auth_failed: false,
  invalid_output: true,
  content_blocked: false,
  media_private: false,
  media_unavailable: false,
  media_unsupported: false,
  media_too_long: false,
  timeout: true,
};

export const AI_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  not_configured: "AI processing isn't set up for this app yet. Your notes and photos are saved.",
  unavailable: "The AI service is temporarily unavailable. We'll retry automatically.",
  rate_limited: "The AI service is busy right now. We'll retry shortly.",
  quota_exceeded: "The AI service's usage limit has been reached. Please try again later.",
  auth_failed: "The AI service rejected our credentials. An administrator needs to check the configuration.",
  invalid_output: "The AI returned an incomplete result. We'll try again.",
  content_blocked: "The AI service declined to process this content.",
  media_private: "This video can't be analyzed directly from its YouTube URL.",
  media_unavailable: "This video isn't available to analyze. It may have been removed or restricted.",
  media_unsupported: "This file type can't be analyzed.",
  media_too_long: "This recording is too long to analyze in one pass.",
  timeout: "Analysis took too long. We'll try again.",
};

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly detail?: string;

  constructor(code: AIErrorCode, options: { detail?: string; message?: string } = {}) {
    super(options.message ?? AI_ERROR_MESSAGES[code]);
    this.name = "AIError";
    this.code = code;
    this.retryable = RETRYABLE[code];
    this.detail = options.detail;
  }
}

export function isAIError(err: unknown): err is AIError {
  return err instanceof AIError;
}
