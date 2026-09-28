import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/http/errors";
import { errorFields, log } from "@/lib/observability/log";

export interface ApiErrorBody {
  error: { code: string; message: string; data?: Record<string, unknown> };
}

export function jsonError(err: AppError): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code: err.code, message: err.message, ...(err.data ? { data: err.data } : {}) } },
    { status: err.status, headers: { "Cache-Control": "no-store" } },
  );
}

export function json<T>(data: T, init: { status?: number } = {}): NextResponse<T> {
  return NextResponse.json(data, { status: init.status ?? 200, headers: { "Cache-Control": "no-store" } });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: converts AppError/ZodError into structured JSON, logs the rest. */
export function route<C>(name: string, handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const started = Date.now();
    try {
      const res = await handler(req, ctx);
      log.debug("api.ok", { route: name, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      if (err instanceof AppError) {
        if (err.status >= 500) log.error("api.error", { route: name, code: err.code, detail: err.detail });
        return jsonError(err);
      }
      if (err instanceof z.ZodError) {
        return jsonError(
          new AppError("validation", "Some of the information sent wasn't valid.", {
            data: { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          }),
        );
      }
      log.error("api.unhandled", { route: name, ms: Date.now() - started, ...errorFields(err) });
      return jsonError(new AppError("internal", "Something went wrong on our side. Please try again."));
    }
  };
}

const MAX_JSON_BYTES = 2_500_000;

/** Reads and validates a JSON body with a size cap. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = MAX_JSON_BYTES): Promise<z.infer<S>> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new AppError("payload_too_large", "That's too large to save in one go.");
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("payload_too_large", "That's too large to save in one go.");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("validation", "The request body wasn't valid JSON.");
  }
  return schema.parse(body);
}

export const uuidParam = z.uuid();
