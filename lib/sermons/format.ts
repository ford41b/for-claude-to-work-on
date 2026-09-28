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
