import { describe, expect, it } from "vitest";
import { parseYouTubeTime, parseYouTubeUrl } from "@/lib/youtube/parse";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
    `http://www.youtube.com/watch?v=${ID}`,
  ])("accepts %s", (url) => {
    const r = parseYouTubeUrl(url);
    expect(r).toEqual({
      ok: true,
      value: { videoId: ID, canonicalUrl: `https://www.youtube.com/watch?v=${ID}`, startSeconds: null },
    });
  });

  it("reads start times", () => {
    const a = parseYouTubeUrl(`https://youtu.be/${ID}?t=1h2m3s`);
    expect(a.ok && a.value.startSeconds).toBe(3723);
    const b = parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=90s`);
    expect(b.ok && b.value.startSeconds).toBe(90);
  });

  it.each([
    ["", "empty"],
    ["not a url at all", "invalid_url"],
    ["https://vimeo.com/12345", "not_youtube"],
    [`https://www.youtube.com.evil.example/watch?v=${ID}`, "not_youtube"],
    ["https://www.youtube.com/playlist?list=PL123", "playlist_only"],
    ["https://www.youtube.com/@SomeChurch", "channel_url"],
    ["https://www.youtube.com/channel/UC123", "channel_url"],
    ["https://www.youtube.com/watch?v=short", "no_video_id"],
    ["https://www.youtube.com/watch", "no_video_id"],
    ["ftp://youtube.com/watch?v=" + ID, "invalid_url"],
    ["javascript:alert(1)", "invalid_url"],
  ])("rejects %s as %s", (url, error) => {
    expect(parseYouTubeUrl(url)).toEqual({ ok: false, error });
  });
});

describe("parseYouTubeTime", () => {
  it("parses forms", () => {
    expect(parseYouTubeTime("90")).toBe(90);
    expect(parseYouTubeTime("2m")).toBe(120);
    expect(parseYouTubeTime("bogus")).toBeNull();
    expect(parseYouTubeTime(null)).toBeNull();
  });
});
