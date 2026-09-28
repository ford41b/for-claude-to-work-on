"use client";

/** Typed JSON client for the app's own API routes. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly data?: Record<string, unknown>;
  constructor(code: string, message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      keepalive: init.keepalive,
      credentials: "same-origin",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError("network", "You're offline or the connection dropped. We'll keep your work on this device.", 0);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; data?: Record<string, unknown> } } | null)?.error;
    throw new ApiClientError(err?.code ?? "error", err?.message ?? "Something went wrong. Please try again.", res.status, err?.data);
  }
  return body as T;
}
