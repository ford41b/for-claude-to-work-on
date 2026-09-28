"use client";

import { Bookmark, CircleHelp, Star } from "lucide-react";
import { TimeLink, VoiceTag } from "@/components/sources/source-chip";

interface Capture {
  id: string;
  category: string;
  title: string;
  description: string;
  timestamp_start: number | null;
  captured_at: string | null;
}

const ICON = { BOOKMARK: Bookmark, IMPORTANT: Star, QUESTION: CircleHelp } as const;
const LABEL: Record<string, string> = { BOOKMARK: "Bookmark", IMPORTANT: "Important", QUESTION: "Question" };

/** Moments captured during the sermon (Sunday Mode buttons). */
export function CaptureList({ captures }: { sermonId: string; captures: Capture[] }) {
  if (!captures.length) return null;
  return (
    <section aria-labelledby="captures-title" className="border-t border-rule pt-6">
      <h2 id="captures-title" className="label-caps mb-3">
        Moments you marked
      </h2>
      <ol className="flex flex-col">
        {captures.map((c) => {
          const Icon = ICON[c.category as keyof typeof ICON] ?? Bookmark;
          return (
            <li key={c.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 last:border-b-0">
              <div className="pt-0.5 text-sm">
                {c.timestamp_start !== null ? (
                  <TimeLink seconds={c.timestamp_start} approximate={false} />
                ) : c.captured_at ? (
                  <span className="font-mono text-ink-muted tabular">{new Date(c.captured_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                ) : null}
              </div>
              <div className="min-w-0">
                <VoiceTag voice="you" icon={Icon}>
                  {LABEL[c.category] ?? "Moment"}
                </VoiceTag>
                <p className="mt-0.5">{c.title}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
