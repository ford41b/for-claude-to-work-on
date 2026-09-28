import type { Metadata } from "next";
import { NotebookSection } from "@/components/sermon/section";
import { MomentLog, SermonRibbon, type TimelineMoment } from "@/components/sermon/timeline";
import { SourceList, TimeLink, VoiceTag } from "@/components/sources/source-chip";
import { AddSources } from "@/components/upload/add-sources";
import { Notice } from "@/components/ui/notice";
import { requirePageUser } from "@/lib/auth/session";
import { citationsFor, getCitations, getNotebookHeader, getPreliminaryAnalysis } from "@/lib/queries/notebook";
import { getPackItems } from "@/lib/queries/pack";

export const metadata: Metadata = { title: "Sermon" };

const EVIDENCE_LABEL: Record<string, string> = {
  heard_verbatim: "Heard word-for-word in the recording (AI transcription)",
  matched_user_note: "Matches your notes word-for-word",
  matched_photo: "Matches a photo word-for-word",
  matched_document: "Matches a document word-for-word",
};

export default async function SermonTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}/sermon`);
  const [header, pack, citations, prelim] = await Promise.all([
    getNotebookHeader(supabase, id),
    getPackItems(supabase, id),
    getCitations(supabase, id),
    getPreliminaryAnalysis(supabase, id),
  ]);
  const { sermon, video, audio } = header;
  const duration = video?.duration_seconds ?? audio?.duration_seconds ?? prelim?.duration_seconds ?? null;
  const recording = video ?? audio;
  const moments: TimelineMoment[] = pack.moments.map((m) => ({
    id: m.id,
    category: m.category,
    title: m.title,
    description: m.description,
    start: m.timestamp_start,
    origin: m.origin,
    timestampSource: m.timestamp_source,
    confidence: m.timestamp_confidence,
    citations: citationsFor(citations, "moment", m.id),
  }));

  return (
    <div className="flex flex-col gap-10">
      {recording?.source.error_message ? (
        <Notice
          tone={recording.source.status === "unavailable" || recording.source.status === "failed" ? "caution" : "info"}
          title={recording.source.error_code === "media_private" ? "This video can't be analyzed directly from its YouTube URL." : "About this recording"}
        >
          {recording.source.error_code === "media_private" ? (
            <>
              You can still watch it here if embedding is allowed. To include it in your Sermon Pack, upload a recording you have
              permission to use, or continue with your notes and photos.
            </>
          ) : (
            recording.source.error_message
          )}
        </Notice>
      ) : null}

      {!recording ? (
        <section aria-labelledby="add-recording" className="flex flex-col gap-3">
          <h2 id="add-recording" className="text-lg font-bold">
            Add the sermon
          </h2>
          <p className="text-ink-muted">Link a public YouTube video or upload a recording to get a clickable timeline.</p>
          <AddSources sermonId={id} hasYouTube={false} />
        </section>
      ) : null}

      {moments.length ? (
        <NotebookSection id="timeline" title="Timeline">
          {recording ? <SermonRibbon duration={duration} sections={pack.sections.map((s) => ({ id: s.id, title: s.title, start: s.timestamp_start, end: s.timestamp_end }))} moments={moments} /> : null}
          <p className="mt-3 text-sm text-ink-muted">
            Times marked <span className="font-mono">~</span> are estimated by AI and may be off by a little. Tap “Correct time” to fix one — your
            correction is kept.
          </p>
          <div className="mt-2">
            <MomentLog moments={moments} sermonId={id} />
          </div>
        </NotebookSection>
      ) : prelim?.segments?.length ? (
        <NotebookSection id="timeline" title="Preliminary timeline">
          <ol className="flex flex-col">
            {prelim.segments.map((s, i) => (
              <li key={i} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 last:border-b-0">
                <TimeLink seconds={s.start} approximate className="pt-0.5 text-sm" />
                <p className="text-[0.9375rem]">{s.summary}</p>
              </li>
            ))}
          </ol>
        </NotebookSection>
      ) : null}

      {pack.sections.length ? (
        <NotebookSection id="outline" title="Outline">
          <ol className="flex flex-col gap-5">
            {pack.sections.map((s, i) => (
              <li key={s.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3">
                <div className="pt-0.5 text-sm">{s.timestamp_start !== null ? <TimeLink seconds={s.timestamp_start} approximate /> : <span className="text-ink-muted">{i + 1}.</span>}</div>
                <div>
                  <h3 className="font-bold leading-snug">{s.title}</h3>
                  {s.summary ? <p className="reading mt-1 leading-relaxed text-ink">{s.summary}</p> : null}
                  <SourceList citations={citationsFor(citations, "section", s.id)} sermonId={id} className="mt-2" />
                </div>
              </li>
            ))}
          </ol>
        </NotebookSection>
      ) : null}

      {sermon.detailed_summary ? (
        <NotebookSection id="summary" title="Summary">
          <VoiceTag voice="ai" />
          <p className="reading mt-2 max-w-prose whitespace-pre-line text-md leading-relaxed">{sermon.detailed_summary}</p>
          <SourceList citations={citationsFor(citations, "sermon", sermon.id, "detailed_summary")} sermonId={id} className="mt-3" />
        </NotebookSection>
      ) : null}

      {pack.quotes.length ? (
        <NotebookSection id="quotes" title="Quotes & paraphrases">
          <ul className="flex flex-col gap-5">
            {pack.quotes.map((q) => (
              <li key={q.id}>
                {q.quote_type === "VERBATIM_QUOTE" ? (
                  <figure>
                    <blockquote className="reading text-lg leading-relaxed">“{q.text}”</blockquote>
                    <figcaption className="mt-1 text-xs font-semibold text-ink-muted">
                      {EVIDENCE_LABEL[q.verbatim_evidence ?? ""] ?? "Quote"}
                    </figcaption>
                  </figure>
                ) : (
                  <div>
                    <p className="label-caps">Paraphrase</p>
                    <p className="reading mt-0.5 text-lg leading-relaxed">{q.text}</p>
                  </div>
                )}
                <SourceList citations={citationsFor(citations, "quote", q.id)} sermonId={id} className="mt-2" />
              </li>
            ))}
          </ul>
        </NotebookSection>
      ) : null}

      {pack.illustrations.length ? (
        <NotebookSection id="illustrations" title="Stories & illustrations">
          <ul className="flex flex-col gap-4">
            {pack.illustrations.map((ill) => (
              <li key={ill.id}>
                <h3 className="font-bold">{ill.title}</h3>
                {ill.summary ? <p className="mt-0.5 text-ink-muted">{ill.summary}</p> : null}
                <SourceList citations={citationsFor(citations, "illustration", ill.id)} sermonId={id} className="mt-2" />
              </li>
            ))}
          </ul>
        </NotebookSection>
      ) : null}

      {pack.terms.length ? (
        <NotebookSection id="terms" title="Terms">
          <dl className="flex flex-col gap-3">
            {pack.terms.map((t) => (
              <div key={t.id}>
                <dt className="font-bold">{t.term}</dt>
                <dd className="text-ink-muted">{t.definition}</dd>
              </div>
            ))}
          </dl>
        </NotebookSection>
      ) : null}
    </div>
  );
}
