/**
 * YouTube URL parsing. Pure and dependency-free so it runs identically in the browser (instant
 * validation while pasting) and on the server (authoritative validation).
 */

export type YouTubeParseError =
  | "empty"
  | "invalid_url"
  | "not_youtube"
  | "playlist_only"
  | "channel_url"
  | "no_video_id";

export interface ParsedYouTubeUrl {
  videoId: string;
  canonicalUrl: string;
  startSeconds: number | null;
}

export type YouTubeParseResult =
  | { ok: true; value: ParsedYouTubeUrl }
  | { ok: false; error: YouTubeParseError };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export const YOUTUBE_PARSE_MESSAGES: Record<YouTubeParseError, string> = {
  empty: "Paste a YouTube link to continue.",
  invalid_url: "That doesn't look like a link. Paste the full YouTube address.",
  not_youtube: "That link isn't from YouTube. You can upload a recording instead.",
  playlist_only: "That's a playlist link. Open the sermon video itself and copy its link.",
  channel_url: "That's a channel page. Open the sermon video and copy its link.",
  no_video_id: "We couldn't find a video in that link. Copy the link from the video's Share button.",
};

/** Parses YouTube `t`/`start` values: "90", "90s", "1m30s", "1h2m3s". */
export function parseYouTubeTime(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^\d+s?$/.test(v)) return Number.parseInt(v, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseYouTubeUrl(input: string): YouTubeParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "empty" };
  if (raw.length > 2048) return { ok: false, error: "invalid_url" };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "invalid_url" };

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, error: "not_youtube" };

  const segments = url.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (host.endsWith("youtu.be")) {
    candidate = segments[0] ?? null;
  } else if (segments[0] === "watch" || segments.length === 0) {
    candidate = url.searchParams.get("v");
  } else if (["embed", "live", "shorts", "v", "e"].includes(segments[0] ?? "")) {
    candidate = segments[1] ?? null;
  } else if (segments[0] === "playlist") {
    return { ok: false, error: "playlist_only" };
  } else if (segments[0]?.startsWith("@") || ["channel", "c", "user"].includes(segments[0] ?? "")) {
    return { ok: false, error: "channel_url" };
  } else if (segments[0] === "attribution_link") {
    const inner = url.searchParams.get("u");
    if (inner) return parseYouTubeUrl(`https://www.youtube.com${inner}`);
  }

  if (!candidate) {
    return url.searchParams.has("list") ? { ok: false, error: "playlist_only" } : { ok: false, error: "no_video_id" };
  }
  if (!VIDEO_ID.test(candidate)) return { ok: false, error: "no_video_id" };

  const startSeconds = parseYouTubeTime(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return {
    ok: true,
    value: {
      videoId: candidate,
      canonicalUrl: `https://www.youtube.com/watch?v=${candidate}`,
      startSeconds,
    },
  };
}
