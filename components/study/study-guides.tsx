"use client";

import { BookOpen, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SourceList, VoiceTag, type ChipCitation } from "@/components/sources/source-chip";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";

const FORMATS = [
  { id: "five_minute", label: "5 minutes", note: "A quick look" },
  { id: "fifteen_minute", label: "15 minutes", note: "Personal study" },
  { id: "thirty_minute", label: "30 minutes", note: "Go deeper" },
  { id: "deep", label: "Deep study", note: "An hour or more" },
  { id: "small_group", label: "Small group", note: "Discussion questions" },
  { id: "youth", label: "Student / youth", note: "Plain and concrete" },
  { id: "personal", label: "Personal reflection", note: "Journaling prompts" },
  { id: "family", label: "Family", note: "For all ages" },
] as const;

const FORMAT_LABEL: Record<string, string> = Object.fromEntries(FORMATS.map((f) => [f.id, f.label]));

export interface StudyGuideData {
  id: string;
  format: string;
  title: string;
  status: "generating" | "ready" | "failed";
  errorMessage: string | null;
  createdAt: string;
  content: {
    big_idea: string;
    primary_scripture: string | null;
    estimated_minutes: number;
    sections: { key: string; heading: string; body: string; items: string[]; source_keys: string[] }[];
  } | null;
  citations: (ChipCitation & { part: string | null })[];
}

export function StudyGenerator({ sermonId, guides }: { sermonId: string; guides: StudyGuideData[] }) {
  const router = useRouter();
  const toast = useToast();
  const [format, setFormat] = useState<string>("fifteen_minute");
  const [busy, setBusy] = useState(false);
  const generating = guides.some((g) => g.status === "generating");

  useEffect(() => {
    if (!generating) return;
    const id = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(id);
  }, [generating, router]);

  const create = async () => {
    setBusy(true);
    try {
      await api(`/api/sermons/${sermonId}/studies`, { body: { format } });
      router.refresh();
    } catch (err) {
      toast.show(err instanceof ApiClientError ? err.message : "Couldn't start the study.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Choose a format</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FORMATS.map((f) => (
            <label
              key={f.id}
              className={cn(
                "flex cursor-pointer flex-col rounded-[12px] border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pen",
                format === f.id ? "border-pen bg-pen-wash" : "border-rule-strong hover:border-field",
              )}
            >
              <input type="radio" name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} className="sr-only" />
              <span className="text-sm font-bold">{f.label}</span>
              <span className="text-xs text-ink-muted">{f.note}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button variant="primary" size="lg" className="self-start" loading={busy} onClick={create} icon={<BookOpen className="size-5" aria-hidden="true" />}>
        Create Bible study
      </Button>
      {guides.length ? (
        <ul className="flex flex-col divide-y divide-rule rounded-[12px] border border-rule">
          {guides.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                {g.status === "ready" ? (
                  <Link href={`?guide=${g.id}`} scroll={false} className="font-semibold hover:text-pen">
                    {g.title || FORMAT_LABEL[g.format]}
                  </Link>
                ) : (
                  <span className="font-semibold">{FORMAT_LABEL[g.format]} study</span>
                )}
                <p className="text-xs text-ink-muted">
                  {g.status === "generating" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Spinner /> Writing your study…
                    </span>
                  ) : g.status === "failed" ? (
                    <span className="text-caution">{g.errorMessage ?? "Couldn't create this study."}</span>
                  ) : (
                    `${FORMAT_LABEL[g.format]} · ${new Date(g.createdAt).toLocaleDateString()}`
                  )}
                </p>
              </div>
              <button
                type="button"
                aria-label="Delete study"
                onClick={async () => {
                  await api(`/api/studies/${g.id}`, { method: "DELETE" }).catch(() => null);
                  router.refresh();
                }}
                className="inline-flex size-10 items-center justify-center rounded-[9px] text-ink-muted hover:bg-paper-sunk hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StudyGuideView({ sermonId, guide, bibleTextAvailable }: { sermonId: string; guide: StudyGuideData; bibleTextAvailable: boolean }) {
  if (!guide.content) return null;
  const c = guide.content;
  return (
    <article aria-labelledby="guide-title" className="rounded-[16px] border border-rule bg-paper-raised p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <VoiceTag voice="ai">AI-generated study</VoiceTag>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
          <Clock className="size-3.5" aria-hidden="true" />
          About {c.estimated_minutes} minutes
        </span>
      </div>
      <h3 id="guide-title" className="reading mt-3 text-2xl font-semibold leading-tight">
        {guide.title}
      </h3>
      <p className="reading mt-3 text-lg leading-relaxed">{c.big_idea}</p>
      {c.primary_scripture ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4 text-ink-muted" aria-hidden="true" />
          {c.primary_scripture}
        </p>
      ) : null}
      {!bibleTextAvailable ? (
        <Notice className="mt-4">Verse text isn’t included — open your own Bible to the references. (No licensed Bible text provider is configured.)</Notice>
      ) : null}
      <div className="mt-6 flex flex-col gap-7">
        {c.sections.map((s) => (
          <section key={s.key} aria-labelledby={`sec-${s.key}`}>
            <h4 id={`sec-${s.key}`} className="text-lg font-bold">
              {s.heading}
            </h4>
            {s.key === "background" ? <p className="label-caps mt-1">General context — not from the sermon</p> : null}
            {s.body ? <p className="reading mt-2 whitespace-pre-line leading-relaxed">{s.body}</p> : null}
            {s.items.length ? (
              <ol className={cn("mt-2 flex flex-col gap-1.5 pl-5", s.key.includes("question") || s.key === "observe" || s.key === "interpret" ? "list-decimal" : "list-disc")}>
                {s.items.map((item, i) => (
                  <li key={i} className="reading leading-relaxed">
                    {item}
                  </li>
                ))}
              </ol>
            ) : null}
            {s.source_keys.length ? (
              <SourceList citations={guide.citations.filter((ct) => ct.part === s.key)} sermonId={sermonId} className="mt-3" />
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
