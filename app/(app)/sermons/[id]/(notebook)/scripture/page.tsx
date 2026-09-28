import type { Metadata } from "next";
import { ScriptureList } from "@/components/sources/scripture-list";
import { requirePageUser } from "@/lib/auth/session";
import { integrationStatuses } from "@/lib/integrations/status";
import { citationsFor, getCitations } from "@/lib/queries/notebook";

export const metadata: Metadata = { title: "Scripture" };

export default async function ScripturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}/scripture`);
  const [{ data: refs }, citations] = await Promise.all([
    supabase.from("scripture_references").select("*").eq("sermon_id", id).eq("hidden", false).order("position"),
    getCitations(supabase, id),
  ]);
  const bibleText = integrationStatuses().find((i) => i.id === "bible_text")?.state === "AVAILABLE";
  return (
    <ScriptureList
      sermonId={id}
      bibleTextAvailable={bibleText}
      refs={(refs ?? []).map((r) => ({
        id: r.id,
        normalized: r.normalized_reference,
        raw: r.reference_text,
        kind: r.kind,
        confidence: r.confidence,
        role: r.role,
        context: r.sermon_context,
        origin: r.origin,
        userEdited: r.user_edited,
        timestamp: r.timestamp_start,
        citations: citationsFor(citations, "scripture", r.id),
      }))}
    />
  );
}
