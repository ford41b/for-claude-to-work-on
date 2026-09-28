"use client";

import { Camera, ChevronDown, FileText, Mic, PenLine, PlayCircle, Sunrise } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { mimeForFile, uploadFile, type UploadKind } from "@/lib/client/uploads";
import { parseYouTubeUrl, YOUTUBE_PARSE_MESSAGES } from "@/lib/youtube/parse";

interface Details {
  title: string;
  speaker: string;
  church: string;
  preachedOn: string;
}

function Option({ icon, title, note, onClick, expanded, controls }: { icon: ReactNode; title: string; note: string; onClick: () => void; expanded?: boolean; controls?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      className="flex w-full items-center gap-4 rounded-[14px] px-3 py-3.5 text-left transition-colors hover:bg-paper-sunk"
    >
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-rule bg-paper-raised text-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-ink-muted">{note}</span>
      </span>
    </button>
  );
}

export function NewSermon() {
  const router = useRouter();
  const [open, setOpen] = useState<"youtube" | "details" | null>("youtube");
  const [url, setUrl] = useState("");
  const [details, setDetails] = useState<Details>({ title: "", speaker: "", church: "", preachedOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const ids = { url: useId(), yt: useId(), rights: useId() };

  const detailBody = () => ({
    title: details.title || undefined,
    speaker: details.speaker || undefined,
    church: details.church || undefined,
    preachedOn: details.preachedOn || undefined,
  });

  const create = async (extra: Record<string, unknown> = {}) => api<{ id: string; noteId: string }>("/api/sermons", { body: { ...detailBody(), ...extra } });

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  };

  const startYouTube = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeUrl(url);
    if (!parsed.ok) {
      setError(YOUTUBE_PARSE_MESSAGES[parsed.error]);
      return;
    }
    void withBusy("youtube", async () => {
      const s = await create({ youtubeUrl: parsed.value.canonicalUrl });
      router.push(`/sermons/${s.id}`);
    });
  };

  const startWithFiles = (kind: UploadKind, files: File[]) => {
    if (!files.length) return;
    void withBusy(kind, async () => {
      const s = await create();
      for (const file of files) {
        await uploadFile({
          sermonId: s.id,
          kind,
          file,
          filename: file.name || `${kind}-${Date.now()}`,
          mimeType: mimeForFile(file),
          capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
          rightsConfirmed: kind === "audio" || kind === "video" ? rights : undefined,
        });
      }
      router.push(`/sermons/${s.id}${kind === "photo" ? "/photos" : ""}`);
    });
  };

  const startNotes = (sunday: boolean) =>
    void withBusy(sunday ? "sunday" : "notes", async () => {
      const s = await create();
      router.push(`/sermons/${s.id}/${sunday ? "sunday" : "notes"}`);
    });

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="mt-8 flex flex-col gap-6">
      {error ? <Notice tone="error">{error}</Notice> : null}

      <section aria-labelledby={ids.yt} className="rounded-[16px] border border-rule bg-paper-raised p-4">
        <h2 id={ids.yt} className="flex items-center gap-2 font-bold">
          <PlayCircle className="size-5 text-pen" aria-hidden="true" />
          From a public YouTube video
        </h2>
        <form onSubmit={startYouTube} className="mt-3 flex flex-col gap-2" noValidate>
          <Field label="YouTube link" htmlFor={ids.url} hint="The video appears in your notebook right away; analysis runs in the background.">
            <div className="flex gap-2">
              <Input
                id={ids.url}
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
              />
              <Button type="submit" variant="primary" className="h-12" loading={busy === "youtube"} disabled={!url.trim() || busy !== null}>
                Start
              </Button>
            </div>
          </Field>
        </form>
      </section>

      <section aria-label="Other ways to start" className="flex flex-col">
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => startWithFiles("photo", Array.from(e.target.files ?? []))} />
        <input ref={library} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => startWithFiles("photo", Array.from(e.target.files ?? []))} />
        <input ref={doc} type="file" accept="application/pdf,text/plain,text/markdown,.md,.txt,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => startWithFiles("document", Array.from(e.target.files ?? []))} />
        <input
          ref={media}
          type="file"
          accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4,.mov"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) startWithFiles(f.type.startsWith("video/") ? "video" : "audio", [f]);
          }}
        />
        <Option icon={<Sunrise className="size-5" aria-hidden="true" />} title="Sunday Mode" note="Minimal note-taking during the service: big buttons, works offline." onClick={() => startNotes(true)} />
        <Option icon={<PenLine className="size-5" aria-hidden="true" />} title="Start notes" note="Open a blank notebook and write." onClick={() => startNotes(false)} />
        <Option icon={<Camera className="size-5" aria-hidden="true" />} title="Take a photo" note="Slides, handouts, or your handwritten notes." onClick={() => camera.current?.click()} />
        <Option icon={<Camera className="size-5" aria-hidden="true" />} title="Choose photos" note="From your photo library." onClick={() => library.current?.click()} />
        <Option icon={<FileText className="size-5" aria-hidden="true" />} title="Upload a document" note="PDF or text handouts." onClick={() => doc.current?.click()} />
        <div className="rounded-[14px] px-3 py-3.5">
          <div className="flex items-center gap-4">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-rule bg-paper-raised">
              <Mic className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Upload a recording</p>
              <p className="text-sm text-ink-muted">For private or unlisted videos, or your own audio.</p>
            </div>
          </div>
          <label htmlFor={ids.rights} className="ml-15 mt-3 flex gap-3 text-sm">
            <input id={ids.rights} type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--pen)]" />
            <span>I made this recording or have permission to upload and process it.</span>
          </label>
          <Button className="ml-15 mt-3" disabled={!rights || busy !== null} loading={busy === "audio" || busy === "video"} onClick={() => media.current?.click()}>
            Choose recording
          </Button>
        </div>
      </section>

      <section className="rounded-[16px] border border-rule">
        <button
          type="button"
          onClick={() => setOpen(open === "details" ? null : "details")}
          aria-expanded={open === "details"}
          aria-controls="new-details"
          className="flex w-full items-center justify-between px-4 py-3.5 font-semibold"
        >
          Add details now (optional)
          <ChevronDown className={cn("size-4 transition-transform", open === "details" && "rotate-180")} aria-hidden="true" />
        </button>
        {open === "details" ? (
          <div id="new-details" className="grid gap-4 border-t border-rule px-4 py-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="n-title" className="sm:col-span-2">
              <Input id="n-title" value={details.title} onChange={set("title")} maxLength={300} />
            </Field>
            <Field label="Speaker" htmlFor="n-speaker">
              <Input id="n-speaker" value={details.speaker} onChange={set("speaker")} maxLength={200} />
            </Field>
            <Field label="Date" htmlFor="n-date">
              <Input id="n-date" type="date" value={details.preachedOn} onChange={set("preachedOn")} />
            </Field>
            <Field label="Church" htmlFor="n-church" className="sm:col-span-2">
              <Input id="n-church" value={details.church} onChange={set("church")} maxLength={200} />
            </Field>
          </div>
        ) : null}
      </section>
      {busy && busy !== "youtube" ? <p role="status" className="text-sm text-ink-muted">Setting up your notebook…</p> : null}
    </div>
  );
}
