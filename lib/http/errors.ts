/**
 * Structured, user-safe errors. `message` is shown to users; `detail` is for logs only and must
 * never contain note text, OCR text, or other private content.
 */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media"
  | "provider_unavailable"
  | "ai_not_configured"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media: 415,
  provider_unavailable: 503,
  ai_not_configured: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: string;
  readonly data?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: { detail?: string; data?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.detail = options.detail;
    this.data = options.data;
  }
}

export const notFound = (what = "That item") => new AppError("not_found", `${what} couldn't be found.`);
export const unauthorized = () => new AppError("unauthorized", "Please sign in to continue.");
export const rateLimited = () =>
  new AppError("rate_limited", "You've done that a lot in a short time. Please wait a few minutes and try again.");
