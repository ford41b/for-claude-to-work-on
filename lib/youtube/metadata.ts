import { z } from "zod";

/**
 * Video metadata. Primary: the official YouTube Data API v3 (`videos.list`, 1 quota unit) when
 * YOUTUBE_API_KEY is configured — it reports privacy, live status, duration, and age
 * restriction. Fallback: oEmbed (widely used, but not formally documented by YouTube), which
 * gives title/channel/thumbnail only. Metadata is never essential: failures leave the user to
 * type details themselves.
 */

export type PrivacyStatus = "public" | "unlisted" | "private" | "unknown";
export type LiveStatus = "none" | "live" | "upcoming" | "unknown";

export interface VideoMetadata {
  provider: "youtube_data_api" | "oembed" | "none";
  found: boolean;
  title: string | null;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  privacyStatus: PrivacyStatus;
  embeddable: boolean | null;
  liveStatus: LiveStatus;
  ageRestricted: boolean | null;
  /** Why the lookup failed or was inconclusive (for logs). */
  note?: string;
}

/** Parses ISO-8601 durations like PT1H2M3S / P0D. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

const dataApiSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z
          .object({
            title: z.string().optional(),
            channelTitle: z.string().optional(),
            publishedAt: z.string().optional(),
            liveBroadcastContent: z.string().optional(),
            thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional(),
          })
          .optional(),
        contentDetails: z
          .object({
            duration: z.string().optional(),
            contentRating: z.object({ ytRating: z.string().optional() }).partial().optional(),
          })
          .optional(),
        status: z.object({ privacyStatus: z.string().optional(), embeddable: z.boolean().optional() }).optional(),
      }),
    )
    .default([]),
});

const oembedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

const EMPTY: Omit<VideoMetadata, "provider" | "found"> = {
  title: null,
  channelTitle: null,
  thumbnailUrl: null,
  publishedAt: null,
  durationSeconds: null,
  privacyStatus: "unknown",
  embeddable: null,
  liveStatus: "unknown",
  ageRestricted: null,
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchVideoMetadata(
  videoId: string,
  options: { apiKey?: string; fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<VideoMetadata> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  if (options.apiKey) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails,status");
      url.searchParams.set("id", videoId);
      url.searchParams.set("key", options.apiKey);
      const res = await fetcher(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const body = dataApiSchema.parse(await res.json());
        const item = body.items[0];
        if (!item) {
          // The Data API does not return private or deleted videos to other users.
          return { ...EMPTY, provider: "youtube_data_api", found: false, note: "not returned by videos.list" };
        }
        const privacy = item.status?.privacyStatus;
        const live = item.snippet?.liveBroadcastContent;
        const thumbs = item.snippet?.thumbnails ?? {};
        return {
          provider: "youtube_data_api",
          found: true,
          title: item.snippet?.title ?? null,
          channelTitle: item.snippet?.channelTitle ?? null,
          thumbnailUrl: thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null,
          publishedAt: item.snippet?.publishedAt ?? null,
          durationSeconds: parseIsoDuration(item.contentDetails?.duration),
          privacyStatus: privacy === "public" || privacy === "unlisted" || privacy === "private" ? privacy : "unknown",
          embeddable: item.status?.embeddable ?? null,
          liveStatus: live === "live" || live === "upcoming" || live === "none" ? live : "unknown",
          ageRestricted: item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted",
        };
      }
      // Fall through to oEmbed on API errors (quota, bad key).
    } catch {
      // Fall through to oEmbed.
    }
  }

  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set("format", "json");
    const res = await fetcher(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) {
      const body = oembedSchema.parse(await res.json());
      return {
        ...EMPTY,
        provider: "oembed",
        found: true,
        title: body.title ?? null,
        channelTitle: body.author_name ?? null,
        thumbnailUrl: body.thumbnail_url ?? null,
      };
    }
    if (res.status === 404 || res.status === 400) {
      return { ...EMPTY, provider: "oembed", found: false, note: `oembed ${res.status}` };
    }
    // 401/403: embedding disabled or private — cannot tell which.
    return { ...EMPTY, provider: "oembed", found: true, note: `oembed ${res.status}` };
  } catch (err) {
    return { ...EMPTY, provider: "none", found: true, note: `metadata unavailable: ${String(err).slice(0, 200)}` };
  }
}

export function youtubeThumbnailFallback(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
