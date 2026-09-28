import { describe, expect, it } from "vitest";
import { fetchVideoMetadata, parseIsoDuration } from "@/lib/youtube/metadata";

// Response bodies follow the documented shapes of videos.list (snippet, contentDetails, status)
// and YouTube's oEmbed endpoint.
const dataApiItem = {
  id: "Fx7WaitSrm1",
  snippet: {
    publishedAt: "2026-09-27T15:00:00Z",
    title: "Faith in the Waiting",
    channelTitle: "Example Church",
    liveBroadcastContent: "none",
    thumbnails: { high: { url: "https://i.ytimg.com/vi/Fx7WaitSrm1/hqdefault.jpg" } },
  },
  contentDetails: { duration: "PT46M5S", contentRating: {} },
  status: { privacyStatus: "public", embeddable: true },
};

function fetcher(routes: Record<string, { status: number; body?: unknown } | Error>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const host = new URL(url).hostname + new URL(url).pathname;
    const route = routes[host];
    if (!route) throw new Error(`unexpected ${url}`);
    if (route instanceof Error) throw route;
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status });
  };
  return { fn, calls };
}

describe("parseIsoDuration", () => {
  it.each([
    ["PT46M5S", 2765],
    ["PT1H2M3S", 3723],
    ["P0D", 0],
    ["P1DT1S", 86401],
    ["garbage", null],
    [null, null],
  ] as const)("%s → %s", (iso, seconds) => {
    expect(parseIsoDuration(iso)).toBe(seconds);
  });
});

describe("fetchVideoMetadata", () => {
  it("uses the Data API when a key is configured", async () => {
    const f = fetcher({ "www.googleapis.com/youtube/v3/videos": { status: 200, body: { items: [dataApiItem] } } });
    const meta = await fetchVideoMetadata("Fx7WaitSrm1", { apiKey: "k", fetcher: f.fn });
    expect(meta).toMatchObject({
      provider: "youtube_data_api",
      found: true,
      title: "Faith in the Waiting",
      channelTitle: "Example Church",
      durationSeconds: 2765,
      privacyStatus: "public",
      embeddable: true,
      liveStatus: "none",
      ageRestricted: false,
    });
    expect(new URL(f.calls[0]!).searchParams.get("part")).toBe("snippet,contentDetails,status");
  });

  it("reports live, unlisted, and age-restricted videos", async () => {
    const item = {
      ...dataApiItem,
      snippet: { ...dataApiItem.snippet, liveBroadcastContent: "live" },
      status: { privacyStatus: "unlisted", embeddable: false },
      contentDetails: { duration: "P0D", contentRating: { ytRating: "ytAgeRestricted" } },
    };
    const f = fetcher({ "www.googleapis.com/youtube/v3/videos": { status: 200, body: { items: [item] } } });
    const meta = await fetchVideoMetadata("Fx7WaitSrm1", { apiKey: "k", fetcher: f.fn });
    expect(meta).toMatchObject({ liveStatus: "live", privacyStatus: "unlisted", embeddable: false, ageRestricted: true });
  });

  it("treats a missing item as not found (private or deleted)", async () => {
    const f = fetcher({ "www.googleapis.com/youtube/v3/videos": { status: 200, body: { items: [] } } });
    const meta = await fetchVideoMetadata("Fx7Private1", { apiKey: "k", fetcher: f.fn });
    expect(meta).toMatchObject({ provider: "youtube_data_api", found: false });
  });

  it("falls back to oEmbed when the Data API errors (quota, bad key)", async () => {
    const f = fetcher({
      "www.googleapis.com/youtube/v3/videos": { status: 403, body: { error: { code: 403 } } },
      "www.youtube.com/oembed": { status: 200, body: { title: "Faith in the Waiting", author_name: "Example Church", thumbnail_url: "https://i.ytimg.com/x.jpg" } },
    });
    const meta = await fetchVideoMetadata("Fx7WaitSrm1", { apiKey: "k", fetcher: f.fn });
    expect(meta).toMatchObject({ provider: "oembed", found: true, title: "Faith in the Waiting", privacyStatus: "unknown", durationSeconds: null });
    expect(f.calls).toHaveLength(2);
  });

  it("uses oEmbed alone without a key, and distinguishes missing from restricted", async () => {
    const missing = fetcher({ "www.youtube.com/oembed": { status: 404 } });
    expect(await fetchVideoMetadata("Fx7Nothing1", { fetcher: missing.fn })).toMatchObject({ provider: "oembed", found: false });
    const restricted = fetcher({ "www.youtube.com/oembed": { status: 401 } });
    expect(await fetchVideoMetadata("Fx7Private1", { fetcher: restricted.fn })).toMatchObject({ provider: "oembed", found: true, privacyStatus: "unknown" });
  });

  it("never throws when the network is unavailable", async () => {
    const offline = fetcher({ "www.youtube.com/oembed": new TypeError("fetch failed") });
    expect(await fetchVideoMetadata("Fx7WaitSrm1", { fetcher: offline.fn })).toMatchObject({ provider: "none", found: true });
  });
});
