/** Display helpers shared by server and client components. */
export function displayTitle(s: { title: string; preached_on?: string | null; created_at: string }) {
  if (s.title.trim()) return s.title;
  const d = new Date(s.preached_on ? `${s.preached_on}T12:00:00` : s.created_at);
  return `Untitled sermon · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function formatSermonDate(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Columns a sermon list row needs, including its YouTube video for the thumbnail. */
export const SERMON_ROW_COLUMNS = "id, title, speaker, church, preached_on, created_at, status, big_idea, video_sources(origin, youtube_video_id)";

type VideoLink = { origin: string; youtube_video_id: string | null };

/**
 * The sermon's YouTube thumbnail, if it has a YouTube source. Built from the video id rather than
 * the stored oEmbed URL so every row gets the same 16:9 rendition (mqdefault has no letterbox).
 */
export function youtubeThumbnail(s: { video_sources?: VideoLink[] | VideoLink | null }): string | null {
  const sources = Array.isArray(s.video_sources) ? s.video_sources : s.video_sources ? [s.video_sources] : [];
  const id = sources.find((v) => v.origin === "youtube" && v.youtube_video_id)?.youtube_video_id;
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}
