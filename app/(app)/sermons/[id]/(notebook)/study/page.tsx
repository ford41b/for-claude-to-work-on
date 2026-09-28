import type { Metadata } from "next";
import { NotebookSection } from "@/components/sermon/section";
import { StudyGenerator, StudyGuideView, type StudyGuideData } from "@/components/study/study-guides";
import { ApplicationList, ReviewList } from "@/components/review/review-list";
import { Notice } from "@/components/ui/notice";
import { requirePageUser } from "@/lib/auth/session";
import { isAIConfigured } from "@/lib/ai/registry";
import { integrationStatuses } from "@/lib/integrations/status";
import { citationsFor, getCitations } from "@/lib/queries/notebook";
import { getPackItems } from "@/lib/queries/pack";

export const metadata: Metadata = { title: "Study" };

export default async function StudyTabPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guide?: string }> }) {
  const { id } = await params;
  const { guide } = await searchParams;
  const { supabase } = await requirePageUser(`/sermons/${id}/study`);
  const [{ data: sermon }, { data: guides }, pack, citations] = await Promise.all([
    supabase.from("sermons").select("current_pack_id, status").eq("id", id).single(),
    supabase.from("study_guides").select("*").eq("sermon_id", id).order("created_at", { ascending: false }),
    getPackItems(supabase, id),
    getCitations(supabase, id),
  ]);
  const bibleText = integrationStatuses().find((i) => i.id === "bible_text")?.state === "AVAILABLE";
  const all: StudyGuideData[] = (guides ?? []).map((g) => ({
    id: g.id,
    format: g.format,
    title: g.title,
    status: g.status as StudyGuideData["status"],
    errorMessage: g.error_message,
    createdAt: g.created_at,
    content: g.content as StudyGuideData["content"],
    citations: citationsFor(citations, "study_guide", g.id).map((c) => ({ ...c, part: c.subjectPart })),
  }));
  const selected = all.find((g) => g.id === guide) ?? all.find((g) => g.status === "ready") ?? null;

  return (
    <div className="flex flex-col gap-10">
      <NotebookSection id="bible-study" title="Bible study">
        {!isAIConfigured() ? (
          <Notice tone="caution">Bible study generation needs AI processing, which isn’t configured.</Notice>
        ) : !sermon?.current_pack_id ? (
          <Notice title="Available once your Sermon Pack is ready">
            {sermon?.status === "draft" ? "Finish the sermon first. " : ""}Studies are built from the Sermon Pack so every section can point back to the sermon and your notes.
          </Notice>
        ) : (
          <StudyGenerator sermonId={id} guides={all} />
        )}
        {selected ? (
          <div className="mt-8">
            <StudyGuideView sermonId={id} guide={selected} bibleTextAvailable={bibleText} />
          </div>
        ) : null}
      </NotebookSection>

      {pack.review.length ? (
        <NotebookSection id="review" title="Review">
          <ReviewList
            items={pack.review.map((r) => ({
              id: r.id,
              kind: r.kind,
              prompt: r.prompt,
              detail: r.detail,
              status: r.status,
              sermonId: id,
              citations: citationsFor(citations, "review_item", r.id),
            }))}
          />
        </NotebookSection>
      ) : null}

      {pack.applications.length ? (
        <NotebookSection id="apply" title="Ways to respond">
          <ApplicationList
            items={pack.applications.map((a) => ({
              id: a.id,
              text: a.text,
              detail: a.detail,
              status: a.status,
              origin: a.origin,
              sermonId: id,
              citations: citationsFor(citations, "application", a.id),
            }))}
          />
        </NotebookSection>
      ) : null}
    </div>
  );
}
