import type { Metadata } from "next";
import { AskPanel, type ThreadMessage } from "@/components/ask/ask-panel";
import { Notice } from "@/components/ui/notice";
import { requirePageUser } from "@/lib/auth/session";
import { isAIConfigured } from "@/lib/ai/registry";
import { getCitations, citationsFor } from "@/lib/queries/notebook";

export const metadata: Metadata = { title: "Ask AI" };

export default async function AskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}/ask`);
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("sermon_id", id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let history: ThreadMessage[] = [];
  if (thread) {
    const [{ data: messages }, citations] = await Promise.all([
      supabase.from("chat_messages").select("id, role, content, answer, created_at").eq("thread_id", thread.id).order("created_at"),
      getCitations(supabase, id),
    ]);
    history = (messages ?? []).map((m) => {
      const a = (m.answer ?? {}) as { confidence?: string; sermon_supported?: boolean; general_background?: string | null; follow_ups?: string[] };
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        confidence: a.confidence ?? null,
        supportedBySermon: a.sermon_supported ?? null,
        generalBackground: a.general_background ?? null,
        followUps: a.follow_ups ?? [],
        citations: citationsFor(citations, "chat_message", m.id).map((c) => ({ ...c, key: c.subjectPart ?? "" })),
      };
    });
  }
  if (!isAIConfigured()) {
    return (
      <Notice tone="caution" title="Ask AI isn't available">
        AI processing isn’t configured for this app. You can still search your notes and photos from the Library.
      </Notice>
    );
  }
  return <AskPanel sermonId={id} threadId={thread?.id ?? null} initial={history} />;
}
