"use client";

import { Bookmark, Check, CircleHelp, Pencil, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { usePlayer } from "@/components/player/player-context";
import { SourceList, TimeLink, type ChipCitation } from "@/components/sources/source-chip";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatTimestamp, parseTimestamp } from "@/lib/time/timestamps";

export interface TimelineMoment {
  id: string;
  category: string;
  title: string;
  description: string;
  start: number | null;
  origin: "ai" | "user";
  timestampSource: "ai" | "user_capture" | "user_correction";
  confidence: "high" | "medium" | "low" | null;
  citations: ChipCitation[];
}

export interface TimelineSection {
  id: string;
  title: string;
  start: number | null;
  end: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  INTRODUCTION: "Introduction",
  CONTEXT: "Context",
  MAIN_POINT: "Main point",
  SCRIPTURE: "Scripture",
  ILLUSTRATION: "Illustration",
  QUOTE: "Quote",
  QUESTION: "Your question",
  APPLICATION: "Application",
  PRAYER: "Prayer",
  CONCLUSION: "Closing",
  BOOKMARK: "Your bookmark",
  IMPORTANT: "Marked important",
  OTHER: "Moment",
};

/**
 * The sermon ribbon: the whole recording at a glance — sections as spans, moments as ticks,
 * and a live playhead. Decorative for assistive tech; the moment log below is the accessible
 * equivalent with the same actions.
 */
export function SermonRibbon({ duration, sections, moments }: { duration: number | null; sections: TimelineSection[]; moments: TimelineMoment[] }) {
  const player = usePlayer();
  const [now, setNow] = useState<number | null>(null);
  const total = duration ?? Math.max(0, ...moments.map((m) => m.start ?? 0), ...sections.map((s) => s.end ?? s.start ?? 0)) * 1.04;

  useEffect(() => {
    if (!player?.ready) return;
    const id = window.setInterval(() => setNow(player.currentTime()), 1000);
    return () => window.clearInterval(id);
  }, [player]);

  if (!total || total < 30) return null;
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / total) * 100))}%`;
  return (
    <div aria-hidden="true" className="select-none">
      <div className="relative h-9 overflow-hidden rounded-[8px] border border-rule bg-paper-sunk">
        {sections
          .filter((s) => s.start !== null)
          .map((s, i) => (
            <div
              key={s.id}
              className={cn("absolute inset-y-0 border-r border-paper", i % 2 ? "bg-paper-deep" : "bg-paper-sunk")}
              style={{ left: pct(s.start!), width: `calc(${pct((s.end ?? s.start! + 60) - s.start!)})` }}
              title={s.title}
            />
          ))}
        {moments
          .filter((m) => m.start !== null)
          .map((m) => (
            <button
              key={m.id}
              type="button"
              tabIndex={-1}
              onClick={() => player?.available && player.seek(m.start!)}
              title={`${formatTimestamp(m.start!, { approximate: m.timestampSource === "ai" })} ${m.title}`}
              className="absolute inset-y-1.5 w-2 -translate-x-1/2 rounded-full"
              style={{ left: pct(m.start!) }}
            >
              <span className={cn("block h-full w-[3px] mx-auto rounded-full", m.origin === "user" ? "bg-pen" : "bg-ink-muted")} />
            </button>
          ))}
        {now !== null ? <div className="absolute inset-y-0 w-0.5 bg-pen" style={{ left: pct(now) }} /> : null}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.7rem] text-ink-muted tabular">
        <span>0:00</span>
        <span>{formatTimestamp(total)}</span>
      </div>
    </div>
  );
}

function MomentIcon({ category }: { category: string }) {
  if (category === "BOOKMARK") return <Bookmark className="size-3.5 text-pen" aria-hidden="true" />;
  if (category === "IMPORTANT") return <Star className="size-3.5 text-pen" aria-hidden="true" />;
  if (category === "QUESTION") return <CircleHelp className="size-3.5 text-pen" aria-hidden="true" />;
  return null;
}

function EditTime({ moment, onDone }: { moment: TimelineMoment; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const player = usePlayer();
  const [value, setValue] = useState(moment.start !== null ? formatTimestamp(moment.start) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const seconds = parseTimestamp(value);
    if (seconds === null) {
      setError("Use minutes:seconds, like 28:15.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/moments/${moment.id}`, { method: "PATCH", body: { timestampStart: seconds } });
      toast.show("Time corrected. It won't be changed automatically.");
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor={`t-${moment.id}`} className="sr-only">
        Correct time
      </label>
      <input
        id={`t-${moment.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        className="h-10 w-24 rounded-[9px] border border-field bg-paper-raised px-3 font-mono text-sm tabular focus:border-pen focus:outline-none"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `t-${moment.id}-err` : undefined}
      />
      {player?.ready ? (
        <button
          type="button"
          onClick={() => {
            const t = player.currentTime();
            if (t !== null) setValue(formatTimestamp(t));
          }}
          className="h-10 rounded-[9px] px-3 text-sm font-semibold text-pen hover:bg-pen-wash"
        >
          Use current time
        </button>
      ) : null}
      <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-1 rounded-[9px] bg-pen px-3 text-sm font-semibold text-on-pen disabled:opacity-50">
        <Check className="size-4" aria-hidden="true" /> Save
      </button>
      <button type="button" onClick={onDone} aria-label="Cancel" className="inline-flex size-10 items-center justify-center rounded-[9px] text-ink-muted hover:bg-paper-sunk">
        <X className="size-4" aria-hidden="true" />
      </button>
      {error ? (
        <p id={`t-${moment.id}-err`} role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** A field log of the sermon: time in the gutter, what happened beside it. */
export function MomentLog({ moments, sermonId, limit }: { moments: TimelineMoment[]; sermonId: string; limit?: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const shown = limit ? moments.slice(0, limit) : moments;
  if (!shown.length) return null;
  return (
    <ol className="flex flex-col">
      {shown.map((m) => {
        const approximate = m.timestampSource === "ai";
        return (
          <li key={m.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-3 last:border-b-0">
            <div className="pt-0.5 text-sm">
              {m.start !== null ? <TimeLink seconds={m.start} approximate={approximate} /> : <span className="font-mono text-ink-muted">—</span>}
              {m.timestampSource === "user_correction" ? <p className="mt-0.5 text-[0.7rem] font-semibold text-ink-muted">corrected</p> : null}
              {approximate && m.confidence === "low" ? <p className="mt-0.5 text-[0.7rem] text-ink-muted">time unsure</p> : null}
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 label-caps">
                <MomentIcon category={m.category} />
                {CATEGORY_LABEL[m.category] ?? "Moment"}
              </p>
              <p className="mt-0.5 font-semibold leading-snug">{m.title}</p>
              {m.description && m.description !== m.title ? <p className="mt-0.5 text-sm text-ink-muted">{m.description}</p> : null}
              {m.origin === "ai" && m.citations.length ? <SourceList citations={m.citations} sermonId={sermonId} className="mt-2" /> : null}
              {editing === m.id ? (
                <EditTime moment={m} onDone={() => setEditing(null)} />
              ) : m.start !== null || m.origin === "ai" ? (
                <button
                  type="button"
                  onClick={() => setEditing(m.id)}
                  className="mt-1.5 inline-flex h-8 items-center gap-1 rounded-[8px] text-xs font-semibold text-ink-muted hover:text-pen"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  Correct time
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
