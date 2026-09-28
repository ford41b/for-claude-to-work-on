import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { SermonThumbnail } from "@/components/library/sermon-thumbnail";
import { displayTitle, formatSermonDate, youtubeThumbnail } from "@/lib/sermons/format";

export interface SermonRowData {
  id: string;
  title: string;
  speaker: string | null;
  church: string | null;
  preached_on: string | null;
  created_at: string;
  status: "draft" | "finished";
  big_idea: string | null;
  video_sources?: { origin: string; youtube_video_id: string | null }[] | null;
}

/** Renders «highlight» markers from Postgres ts_headline as <mark>. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("«") ? (
          <mark key={i} className="rounded-[3px] bg-highlighter px-0.5 text-ink">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function SermonRow({ s, extra }: { s: SermonRowData; extra?: React.ReactNode }) {
  const meta = [s.speaker, s.church, formatSermonDate(s.preached_on) ?? new Date(s.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })].filter(Boolean);
  const thumbnail = youtubeThumbnail(s);
  return (
    <li>
      <Link href={`/sermons/${s.id}`} className="group flex items-start gap-3 border-b border-rule py-4 sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="reading text-lg font-semibold leading-snug group-hover:text-pen">{displayTitle(s)}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {meta.join(" · ")}
            {s.status === "draft" ? " · in progress" : ""}
          </p>
          {s.big_idea ? <p className="mt-1.5 line-clamp-2 text-[0.9375rem] text-ink-muted">{s.big_idea}</p> : null}
          {extra}
        </div>
        {thumbnail ? (
          <SermonThumbnail src={thumbnail} className="mt-1 w-24 transition-opacity group-hover:opacity-90 sm:w-32" />
        ) : (
          <ChevronRight className="mt-1.5 size-4 shrink-0 text-ink-faint group-hover:text-pen" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}
