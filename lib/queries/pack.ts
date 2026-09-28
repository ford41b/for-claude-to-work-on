import "server-only";
import type { AppSupabaseClient, Tables } from "@/lib/supabase/types";

/** Current Sermon Pack items for a notebook (user-scoped reads). Hidden items are excluded. */
export async function getPackItems(supabase: AppSupabaseClient, sermonId: string) {
  const [ideas, sections, moments, scripture, quotes, illustrations, applications, review, questions, terms] = await Promise.all([
    supabase.from("main_ideas").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
    supabase.from("sermon_sections").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
    supabase.from("sermon_moments").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("timestamp_start", { nullsFirst: false }),
    supabase.from("scripture_references").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
    supabase.from("quotes").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
    supabase.from("illustrations").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
    supabase.from("applications").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
    supabase.from("review_items").select("*").eq("sermon_id", sermonId).neq("status", "hidden").order("position"),
    supabase.from("questions").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("created_at"),
    supabase.from("terms").select("*").eq("sermon_id", sermonId).eq("hidden", false).order("position"),
  ]);
  for (const r of [ideas, sections, moments, scripture, quotes, illustrations, applications, review, questions, terms]) if (r.error) throw r.error;
  return {
    ideas: ideas.data as Tables<"main_ideas">[],
    sections: sections.data as Tables<"sermon_sections">[],
    moments: moments.data as Tables<"sermon_moments">[],
    scripture: scripture.data as Tables<"scripture_references">[],
    quotes: quotes.data as Tables<"quotes">[],
    illustrations: illustrations.data as Tables<"illustrations">[],
    applications: applications.data as Tables<"applications">[],
    review: review.data as Tables<"review_items">[],
    questions: questions.data as Tables<"questions">[],
    terms: terms.data as Tables<"terms">[],
  };
}

export type PackItems = Awaited<ReturnType<typeof getPackItems>>;

export async function getNotesWithBlocks(supabase: AppSupabaseClient, sermonId: string) {
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, content, version, plain_text, updated_at, created_at")
    .eq("sermon_id", sermonId)
    .order("created_at");
  if (error) throw error;
  return data;
}
