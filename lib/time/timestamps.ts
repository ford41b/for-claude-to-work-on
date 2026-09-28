/**
 * Sermon timestamps are seconds (floating point). AI-derived times are approximate and render
 * with a leading "~"; user-captured or user-corrected times render plainly.
 */

export type TimestampSource = "ai" | "user_capture" | "user_correction";

export function formatTimestamp(seconds: number, options: { approximate?: boolean } = {}): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return options.approximate ? `~${body}` : body;
}

export function formatTimestampRange(
  start: number | null | undefined,
  end: number | null | undefined,
  options: { approximate?: boolean } = {},
): string {
  if (start === null || start === undefined) return "";
  const first = formatTimestamp(start, options);
  if (end === null || end === undefined || end <= start + 1) return first;
  return `${first}–${formatTimestamp(end)}`;
}

/** Whether a timestamp should render as approximate. */
export function isApproximate(source: TimestampSource | null | undefined): boolean {
  return source !== "user_capture" && source !== "user_correction";
}

/** Parses "18:42", "1:02:05", "18m42s", "90", "90s". Returns null for invalid input. */
export function parseTimestamp(input: string): number | null {
  const v = input.trim().replace(/^~/, "");
  if (!v) return null;
  if (/^\d+(\.\d+)?s?$/.test(v)) return Number.parseFloat(v);
  const hms = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(v);
  if (hms) {
    const [, a, b, c] = hms;
    return c !== undefined ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
  }
  const units = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i.exec(v);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  return null;
}

/** Clamps a timestamp into [0, duration] when the duration is known. */
export function clampTimestamp(seconds: number, durationSeconds?: number | null): number {
  const lower = Math.max(0, seconds);
  if (durationSeconds && durationSeconds > 0) return Math.min(lower, durationSeconds);
  return lower;
}
