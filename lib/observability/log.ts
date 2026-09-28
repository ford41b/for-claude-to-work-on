/**
 * Structured JSON logging. Never log user content (notes, OCR text, questions, answers):
 * log identifiers, codes, durations, and counts only.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  return ORDER[lvl] ?? ORDER.info;
}

export type LogFields = Record<string, string | number | boolean | null | undefined | string[]>;

function emit(level: Level, event: string, fields: LogFields = {}) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error_name: err.name, error_message: err.message.slice(0, 500) };
  }
  return { error_message: String(err).slice(0, 500) };
}
