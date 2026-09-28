import { BookOpen, CircleHelp, Image as ImageIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProcessingStages } from "@/components/sermon/processing";
import { ItemCorrection } from "@/components/sermon/item-correction";
import { RebuildButton } from "@/components/sermon/rebuild-button";
import { NotebookSection } from "@/components/sermon/section";
import { MomentLog, SermonRibbon, type TimelineMoment } from "@/components/sermon/timeline";
import { AddSources } from "@/components/upload/add-sources";
import { ApplicationList, ReviewList } from "@/components/review/review-list";
import { SourceList, TimeLink, VoiceTag, type ChipCitation } from "@/components/sources/source-chip";
import { Notice } from "@/components/ui/notice";
import { requirePageUser } from "@/lib/auth/session";
import { isAIConfigured } from "@/lib/ai/registry";
import { citationsFor, getCitations, getNotebookHeader, getPhotos, getPreliminaryAnalysis, type CitationView } from "@/lib/queries/notebook";
import { getNotesWithBlocks, getPackItems } from "@/lib/queries/pack";

export const metadata: Metadata = { title: "Overview" };

const chips = (c: CitationView[]): ChipCitation[] => c;

const KIND_NOTE: Record<string, string> = {
  spoken: "heard in the sermon",
  allusion: "story referred to by name",
  inferred: "suggested by AI from the sources",
};

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}`);
  const [header, pack, citations, photos, notes, prelim] = await Promise.all([
    getNotebookHeader(supabase, id),
    getPackItems(supabase, id),
    getCitations(supabase, id),
    getPhotos(supabase, id),
    getNotesWithBlocks(supabase, id),
    getPreliminaryAnalysis(supabase, id),
  ]);
  const { sermon, video, audio } = header;
  const hasPack = Boolean(sermon.current_pack_id);
  const duration = video?.duration_seconds ?? audio?.duration_seconds ?? prelim?.duration_seconds ?? null;
  const hasMedia = Boolean(video || audio);

  const moments: TimelineMoment[] = pack.moments.map((m) => ({
    id: m.id,
    category: m.category,
    title: m.title,
    description: m.description,
    start: m.timestamp_start,
    origin: m.origin,
    timestampSource: m.timestamp_source,
    confidence: m.timestamp_confidence,
    citations: chips(citationsFor(citations, "moment", m.id)),
  }));
  const sectionsForRibbon = pack.sections.map((s) => ({ id: s.id, title: s.title, start: s.timestamp_start, end: s.timestamp_end }));
  const noteText = notes.map((n) => n.plain_text).join("\n").trim();
  const userQuestions = pack.questions.filter((q) => q.origin === "user");
  const openReview = pack.review.filter((r) => r.status === "new" || r.status === "review_again").slice(0, 4);

  return (
    <div className="flex flex-col gap-10">
      <ProcessingStages sermonId={id} className="lg:hidden" />

      {!hasPack ? (
        <div className="flex flex-col gap-6">
          {sermon.status === "draft" ? (
            <section aria-labelledby="start-title" className="flex flex-col gap-4">
              <h2 id="start-title" className="text-lg font-bold">
                Capture the sermon, then finish
              </h2>
              <p className="max-w-prose text-ink-muted">
                Take notes, photograph slides, and link the video or a recording. When the sermon ends, tap{" "}
                <strong className="text-ink">Finish sermon</strong> and everything becomes one Sermon Pack with the big idea, main points,
                timeline, and Scripture — each linked back to where it came from.
              </p>
              <AddSources sermonId={id} hasYouTube={Boolean(video?.origin === "youtube")} compact />
            </section>
          ) : isAIConfigured() ? (
            <section aria-live="polite" className="flex flex-col gap-3">
              <p className="label-caps">Big idea</p>
              <div className="skeleton h-6 w-11/12" />
              <div className="skeleton h-6 w-4/5" />
              <p className="text-sm text-ink-muted">Your Sermon Pack is being built. Your notes and photos are already saved.</p>
            </section>
          ) : (
            <Notice tone="caution" title="Sermon Packs need AI processing">
              AI processing isn’t configured for this app, so there’s no generated summary. Your notes, photos, Scripture detected in your
              notes, and search all still work.
            </Notice>
          )}

          {prelim?.segments?.length ? (
            <NotebookSection id="prelim-title" title="Preliminary timeline">
              <p className="mb-3 text-sm text-ink-muted">
                <VoiceTag voice="ai">From the recording</VoiceTag> Times are approximate. This becomes the full timeline once the Sermon Pack is
                built.
              </p>
              <ol className="flex flex-col">
                {prelim.segments.slice(0, 12).map((s, i) => (
                  <li key={i} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 last:border-b-0">
                    <TimeLink seconds={s.start} approximate className="pt-0.5 text-sm" />
                    <p className="text-[0.9375rem]">{s.summary}</p>
                  </li>
                ))}
              </ol>
            </NotebookSection>
          ) : null}
        </div>
      ) : (
        <>
          <section aria-labelledby="big-idea-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="big-idea-title" className="label-caps">
                Big idea
              </h2>
              <VoiceTag voice="ai" />
            </div>
            <p className="reading mt-3 text-xl leading-[1.55] sm:text-[1.5rem] sm:leading-[1.5]">{sermon.big_idea}</p>
            <SourceList citations={chips(citationsFor(citations, "sermon", sermon.id, "big_idea"))} sermonId={id} className="mt-4" />
            {sermon.pack_stale ? (
              <Notice className="mt-5" title="Your notes changed since this pack was built">
                It updates automatically in a few minutes, or you can rebuild it now. Your own edits are kept.
                <div className="mt-2">
                  <RebuildButton sermonId={id} />
                </div>
              </Notice>
            ) : null}
          </section>

          {pack.ideas.length ? (
            <NotebookSection id="ideas-title" title="Main ideas">
              <ol className="flex flex-col">
                {pack.ideas.map((idea) => (
                  <li key={idea.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-4 first:pt-0 last:border-b-0">
                    <div className="pt-1 text-sm">
                      {idea.timestamp_start !== null ? <TimeLink seconds={idea.timestamp_start} approximate /> : null}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold leading-snug">
                        {idea.title}
                        {idea.user_edited ? <span className="ml-2 align-middle text-xs font-semibold text-pen">edited by you</span> : null}
                      </h3>
                      {idea.summary ? <p className="reading mt-1 text-md leading-relaxed text-ink">{idea.summary}</p> : null}
                      {idea.scripture_refs.length ? (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                          <BookOpen className="size-3.5" aria-hidden="true" />
                          {idea.scripture_refs.join(" · ")}
                        </p>
                      ) : null}
                      <SourceList citations={chips(citationsFor(citations, "main_idea", idea.id))} sermonId={id} className="mt-3" />
                      <ItemCorrection
                        table="main_ideas"
                        id={idea.id}
                        itemLabel="Main idea"
                        fields={[
                          { name: "title", label: "Main idea", value: idea.title },
                          { name: "summary", label: "Summary", value: idea.summary ?? "", multiline: true },
                        ]}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </NotebookSection>
          ) : null}

          {moments.length ? (
            <NotebookSection id="timeline-title" title="Sermon timeline" action={{ href: `/sermons/${id}/sermon`, label: "Full timeline" }}>
              {hasMedia ? <SermonRibbon duration={duration} sections={sectionsForRibbon} moments={moments} /> : null}
              <div className="mt-3">
                <MomentLog moments={moments} sermonId={id} limit={8} />
              </div>
            </NotebookSection>
          ) : null}
        </>
      )}

      {pack.scripture.length ? (
        <NotebookSection id="scripture-title" title="Scripture" action={{ href: `/sermons/${id}/scripture`, label: "All references" }}>
          <ul className="flex flex-col gap-3">
            {pack.scripture.slice(0, 8).map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="reading text-lg font-semibold">{s.normalized_reference}</span>
                  {s.role === "primary" ? <span className="label-caps text-pen">Main text</span> : null}
                  {KIND_NOTE[s.kind] ? <span className="text-xs text-ink-muted">{KIND_NOTE[s.kind]}</span> : null}
                  {s.origin === "user" ? <VoiceTag voice="you">Added by you</VoiceTag> : null}
                </p>
                {s.sermon_context ? <p className="text-sm text-ink-muted">{s.sermon_context}</p> : null}
              </li>
            ))}
          </ul>
        </NotebookSection>
      ) : null}

      <NotebookSection id="notes-title" title="Your notes" action={{ href: `/sermons/${id}/notes`, label: noteText ? "Open notes" : "Start writing" }}>
        {noteText ? (
          <div className="reading whitespace-pre-line text-md leading-relaxed">
            {noteText.split("\n").slice(0, 8).join("\n")}
            {noteText.split("\n").length > 8 ? <span className="text-ink-muted"> …</span> : null}
          </div>
        ) : (
          <p className="text-ink-muted">No notes yet. Your notes stay exactly as you write them — AI never rewrites them.</p>
        )}
        {userQuestions.length ? (
          <ul className="mt-4 flex flex-col gap-2">
            {userQuestions.map((q) => (
              <li key={q.id} className="flex gap-2 text-[0.9375rem]">
                <CircleHelp className="mt-1 size-4 shrink-0 text-pen" aria-hidden="true" />
                <span>
                  {q.text}
                  {q.timestamp_seconds !== null ? (
                    <>
                      {" "}
                      <TimeLink seconds={q.timestamp_seconds} approximate={false} className="text-xs" />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </NotebookSection>

      {photos.length ? (
        <NotebookSection id="photos-title" title="Photos" action={{ href: `/sermons/${id}/photos`, label: "All photos" }}>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.slice(0, 8).map((p) => (
              <li key={p.sourceId}>
                <Link href={`/sermons/${id}/photos?photo=${p.sourceId}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden rounded-[10px] border border-rule bg-paper-sunk">
                    {p.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.previewUrl} alt={p.ocr?.title ? `${p.label}: ${p.ocr.title}` : p.label} className="size-full object-cover transition-opacity group-hover:opacity-90" loading="lazy" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-ink-muted">
                        <ImageIcon className="size-5" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-ink-muted">{p.label}</p>
                </Link>
              </li>
            ))}
          </ul>
        </NotebookSection>
      ) : null}

      {openReview.length || pack.applications.length ? (
        <NotebookSection id="week-title" title="This week" action={{ href: `/sermons/${id}/study`, label: "Study" }}>
          <div className="flex flex-col gap-6">
            <ReviewList
              items={openReview.map((r) => ({
                id: r.id,
                kind: r.kind,
                prompt: r.prompt,
                detail: r.detail,
                status: r.status,
                sermonId: id,
                citations: chips(citationsFor(citations, "review_item", r.id)),
              }))}
            />
            {pack.applications.length ? (
              <div>
                <h3 className="mb-2 text-sm font-bold">Ways to respond</h3>
                <ApplicationList
                  items={pack.applications.map((a) => ({
                    id: a.id,
                    text: a.text,
                    detail: a.detail,
                    status: a.status,
                    origin: a.origin,
                    sermonId: id,
                    citations: chips(citationsFor(citations, "application", a.id)),
                  }))}
                />
              </div>
            ) : null}
          </div>
        </NotebookSection>
      ) : null}
    </div>
  );
}
