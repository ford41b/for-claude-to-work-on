"use client";

import { BookOpen, FileText, Image as ImageIcon, PenLine, Play } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePlayer } from "@/components/player/player-context";
import { cn } from "@/lib/client/cn";
import { formatTimestamp, formatTimestampRange } from "@/lib/time/timestamps";

export type Voice = "you" | "sermon" | "scripture" | "photo" | "doc" | "ai";

export interface ChipCitation {
  sourceId: string;
  sourceType: string;
  sourceLabel: string;
  noteBlockId: string | null;
  timestampStart: number | null;
  timestampEnd: number | null;
  page: number | null;
  excerpt?: string | null;
  confidence?: string | null;
}

export function voiceOf(sourceType: string): Voice {
  switch (sourceType) {
    case "USER_NOTE":
      return "you";
    case "SERMON_VIDEO":
    case "UPLOADED_VIDEO":
    case "UPLOADED_AUDIO":
      return "sermon";
    case "PHOTO":
    case "OCR_EXTRACTION":
      return "photo";
    case "DOCUMENT":
      return "doc";
    case "BIBLE_SOURCE":
      return "scripture";
    default:
      return "ai";
  }
}

const VOICE_META: Record<Voice, { label: string; icon: typeof Play }> = {
  you: { label: "You", icon: PenLine },
  sermon: { label: "Sermon", icon: Play },
  scripture: { label: "Scripture", icon: BookOpen },
  photo: { label: "Photo", icon: ImageIcon },
  doc: { label: "Document", icon: FileText },
  ai: { label: "AI", icon: PenLine },
};

/** A printed field label naming whose voice a block is in. Never color alone. */
export function VoiceTag({
  voice,
  children,
  className,
  icon,
}: {
  voice: Voice;
  children?: ReactNode;
  className?: string;
  icon?: typeof Play;
}) {
  if (voice === "ai") {
    return (
      <span className={cn("label-caps inline-flex items-center gap-1.5", className)}>
        <span aria-hidden="true" className="inline-block h-px w-3 border-t border-dashed border-ink-muted" />
        {children ?? "AI summary"}
      </span>
    );
  }
  const { label } = VOICE_META[voice];
  const Icon = icon ?? VOICE_META[voice].icon;
  return (
    <span className={cn("label-caps inline-flex items-center gap-1.5", voice === "you" && "text-pen", className)}>
      <Icon className="size-3" aria-hidden="true" strokeWidth={2.4} />
      {children ?? label}
    </span>
  );
}

const chipBase =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold leading-none transition-colors duration-150";

function spokenTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} minute${m === 1 ? "" : "s"} ${s} second${s === 1 ? "" : "s"}`;
}

/** One piece of evidence. Sermon chips seek the player; others open the exact source. */
export function SourceChip({ c, sermonId }: { c: ChipCitation; sermonId: string }) {
  const player = usePlayer();
  const voice = voiceOf(c.sourceType);
  const Icon = VOICE_META[voice].icon;

  if (voice === "sermon" && c.timestampStart !== null) {
    const text = formatTimestampRange(c.timestampStart, c.timestampEnd, { approximate: true });
    const canSeek = Boolean(player?.available);
    const title = `${c.confidence === "low" ? "Approximate (low confidence) — " : "Approximate — "}jump to about ${formatTimestamp(c.timestampStart)} in the sermon`;
    const content = (
      <>
        <Play className="size-3" aria-hidden="true" strokeWidth={2.6} />
        <span className="font-mono tabular">{text}</span>
        {c.confidence === "low" ? <span className="font-normal text-ink-muted">unsure</span> : null}
      </>
    );
    return canSeek ? (
      <button
        type="button"
        onClick={() => player!.seek(c.timestampStart!)}
        title={title}
        aria-label={`Sermon, about ${spokenTime(c.timestampStart)}. Play from here.`}
        className={cn(chipBase, "border-rule-strong bg-paper-raised text-ink hover:border-pen hover:text-pen")}
      >
        {content}
      </button>
    ) : (
      <span title={title} className={cn(chipBase, "border-rule bg-paper-raised text-ink-muted")}>
        {content}
      </span>
    );
  }

  let href = `/sermons/${sermonId}/sources`;
  let text = c.sourceLabel;
  if (voice === "you") {
    href = `/sermons/${sermonId}/notes${c.noteBlockId ? `#block-${encodeURIComponent(c.noteBlockId)}` : ""}`;
    text = c.timestampStart !== null ? `Your note · ${formatTimestamp(c.timestampStart)}` : "Your note";
  } else if (voice === "photo") {
    href = `/sermons/${sermonId}/photos?photo=${c.sourceId}`;
  } else if (voice === "doc") {
    href = `/sermons/${sermonId}/sources?source=${c.sourceId}${c.page ? `&page=${c.page}` : ""}`;
    text = c.page ? `${c.sourceLabel}, p. ${c.page}` : c.sourceLabel;
  } else if (voice === "sermon") {
    href = `/sermons/${sermonId}/sermon`;
  }
  return (
    <Link
      href={href}
      title={c.excerpt ?? undefined}
      className={cn(
        chipBase,
        voice === "you"
          ? "border-pen/40 bg-pen-wash text-pen hover:border-pen"
          : "border-rule-strong bg-paper-raised text-ink hover:border-pen hover:text-pen",
      )}
    >
      <Icon className="size-3" aria-hidden="true" strokeWidth={2.4} />
      {text}
    </Link>
  );
}

/** The "Sources" line under any generated item. Honest when there is none. */
export function SourceList({ citations, sermonId, className, emptyLabel }: { citations: ChipCitation[]; sermonId: string; className?: string; emptyLabel?: string }) {
  if (!citations.length) {
    return (
      <p className={cn("text-xs text-ink-muted", className)}>
        <VoiceTag voice="ai">{emptyLabel ?? "AI inference — no direct source"}</VoiceTag>
      </p>
    );
  }
  // One chip per distinct source location.
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    const k = `${c.sourceId}:${c.noteBlockId ?? ""}:${c.timestampStart ?? ""}:${c.page ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <ul aria-label="Sources" className={cn("flex flex-wrap gap-1.5", className)}>
      {unique.slice(0, 6).map((c, i) => (
        <li key={i}>
          <SourceChip c={c} sermonId={sermonId} />
        </li>
      ))}
      {unique.length > 6 ? <li className="self-center text-xs text-ink-muted">+{unique.length - 6} more</li> : null}
    </ul>
  );
}

/** A plain timestamp that seeks the player (user captures: exact; AI: approximate). */
export function TimeLink({ seconds, approximate, className }: { seconds: number; approximate: boolean; className?: string }) {
  const player = usePlayer();
  const text = formatTimestamp(seconds, { approximate });
  if (!player?.available) return <span className={cn("font-mono tabular text-ink-muted", className)}>{text}</span>;
  return (
    <button
      type="button"
      onClick={() => player.seek(seconds)}
      aria-label={`${approximate ? "About " : ""}${spokenTime(seconds)}. Play from here.`}
      className={cn("font-mono tabular text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-pen hover:decoration-pen", className)}
    >
      {text}
    </button>
  );
}
