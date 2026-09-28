"use client";

import { Camera, FileText, Images, Link2, Mic, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { usePlayer } from "@/components/player/player-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { kindForFile, mimeForFile, uploadFile, type UploadKind } from "@/lib/client/uploads";
import { outbox } from "@/lib/offline/store";
import { parseYouTubeUrl, YOUTUBE_PARSE_MESSAGES } from "@/lib/youtube/parse";

interface Progress {
  id: string;
  name: string;
  fraction: number;
  state: "uploading" | "done" | "queued" | "error";
  message?: string;
}

export function useUploader(sermonId: string) {
  const router = useRouter();
  const toast = useToast();
  const player = usePlayer();
  const [items, setItems] = useState<Progress[]>([]);

  const update = (id: string, patch: Partial<Progress>) => setItems((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const upload = async (files: File[], options: { kindOverride?: UploadKind; rightsConfirmed?: boolean } = {}) => {
    const playhead = player?.ready ? player.currentTime() : null;
    let anyDone = false;
    for (const file of files) {
      const kind = options.kindOverride ?? kindForFile(file);
      const id = crypto.randomUUID();
      if (!kind) {
        toast.show(`“${file.name}” isn't a supported file type.`, { tone: "error" });
        continue;
      }
      setItems((all) => [...all, { id, name: file.name, fraction: 0, state: "uploading" }]);
      const capturedAt = new Date(file.lastModified || Date.now()).toISOString();
      if (kind === "photo" && !navigator.onLine) {
        await outbox.add({
          id,
          kind: "photo",
          sermonId,
          file,
          filename: file.name,
          mimeType: mimeForFile(file),
          capturedAt,
          sermonTimestampSeconds: playhead,
          attempts: 0,
          createdAt: Date.now(),
        });
        update(id, { state: "queued", message: "Saved on this device — uploads when you're back online" });
        continue;
      }
      try {
        await uploadFile({
          sermonId,
          kind,
          file,
          filename: file.name || `${kind}-${Date.now()}`,
          mimeType: mimeForFile(file),
          capturedAt,
          sermonTimestampSeconds: kind === "photo" ? playhead : null,
          rightsConfirmed: options.rightsConfirmed,
          onProgress: (fraction) => update(id, { fraction }),
        });
        update(id, { state: "done", fraction: 1 });
        anyDone = true;
      } catch (err) {
        if (kind === "photo" && !(err instanceof ApiClientError && err.status >= 400)) {
          await outbox.add({
            id,
            kind: "photo",
            sermonId,
            file,
            filename: file.name,
            mimeType: mimeForFile(file),
            capturedAt,
            sermonTimestampSeconds: playhead,
            attempts: 0,
            createdAt: Date.now(),
          });
          update(id, { state: "queued", message: "Saved on this device — uploads when the connection returns" });
        } else {
          update(id, { state: "error", message: err instanceof Error ? err.message : "Upload failed" });
        }
      }
    }
    if (anyDone) router.refresh();
  };

  return { items, upload, clear: () => setItems((all) => all.filter((p) => p.state === "uploading")) };
}

export function UploadProgress({ items }: { items: Progress[] }) {
  if (!items.length) return null;
  return (
    <ul aria-live="polite" className="flex flex-col gap-2">
      {items.map((p) => (
        <li key={p.id} className="rounded-[10px] border border-rule bg-paper-raised px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{p.name}</span>
            <span className={cn("shrink-0 text-xs font-semibold", p.state === "error" ? "text-danger" : "text-ink-muted")}>
              {p.state === "uploading" ? `${Math.round(p.fraction * 100)}%` : p.state === "done" ? "Uploaded" : p.state === "queued" ? "Waiting for connection" : "Failed"}
            </span>
          </div>
          {p.state === "uploading" ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)} aria-label={`Uploading ${p.name}`}>
              <div className="h-full rounded-full bg-pen transition-[width] duration-300" style={{ width: `${Math.max(4, p.fraction * 100)}%` }} />
            </div>
          ) : null}
          {p.message ? <p className="mt-1 text-xs text-ink-muted">{p.message}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function YouTubeLinkForm({ sermonId, onDone }: { sermonId: string; onDone?: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeUrl(url);
    if (!parsed.ok) {
      setError(YOUTUBE_PARSE_MESSAGES[parsed.error]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sermons/${sermonId}/youtube`, { body: { url: parsed.value.canonicalUrl } });
      setUrl("");
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't link that video.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <Field label="Public YouTube link" htmlFor={inputId} error={error} hint="Paste the sermon's link from YouTube's Share button.">
        <div className="flex gap-2">
          <Input
            id={inputId}
            type="url"
            inputMode="url"
            placeholder="https://youtu.be/…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            autoComplete="off"
          />
          <Button type="submit" variant="primary" loading={busy} disabled={!url.trim()} className="h-12">
            Link
          </Button>
        </div>
      </Field>
    </form>
  );
}

function RecordingSheet({ sermonId, open, onOpenChange }: { sermonId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { items, upload } = useUploader(sermonId);
  const [rights, setRights] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const rightsId = useId();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a recording"
      description="Use this for private or unlisted videos, or any recording you have. Audio (MP3, M4A, WAV) or video (MP4, MOV)."
    >
      <div className="flex flex-col gap-4">
        <label htmlFor={rightsId} className="flex gap-3 rounded-[12px] border border-rule bg-paper-sunk p-3 text-sm">
          <input id={rightsId} type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--pen)]" />
          <span>
            I made this recording or have permission to upload and process it. It stays private to my account and is sent to the AI
            service only for analysis.
          </span>
        </label>
        <input
          ref={input}
          type="file"
          accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4,.mov"
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void upload(files.slice(0, 1), { rightsConfirmed: true });
          }}
        />
        <Button variant="primary" size="lg" disabled={!rights} onClick={() => input.current?.click()} icon={<Upload className="size-5" aria-hidden="true" />}>
          Choose recording
        </Button>
        <UploadProgress items={items} />
      </div>
    </Sheet>
  );
}

/** Everything a notebook can take in: link, camera, library, recording, document, drag and drop. */
export function AddSources({ sermonId, hasYouTube, compact = false }: { sermonId: string; hasYouTube: boolean; compact?: boolean }) {
  const { items, upload } = useUploader(sermonId);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const media = files.filter((f) => f.type.startsWith("audio/") || f.type.startsWith("video/"));
    if (media.length) setRecording(true);
    void upload(files.filter((f) => !media.includes(f)));
  };

  return (
    <div className="flex flex-col gap-4">
      {!hasYouTube ? <YouTubeLinkForm sermonId={sermonId} /> : null}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "grid gap-2 rounded-[14px] border border-dashed p-3 transition-colors",
          compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2",
          dragging ? "border-pen bg-pen-wash" : "border-rule-strong",
        )}
      >
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void upload(f, { kindOverride: "photo" }); }} />
        <input ref={library} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void upload(f, { kindOverride: "photo" }); }} />
        <input ref={doc} type="file" accept="application/pdf,text/plain,text/markdown,.md,.txt,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void upload(f, { kindOverride: "document" }); }} />
        <button type="button" onClick={() => camera.current?.click()} className={buttonClass("secondary", "md", "justify-start")}>
          <Camera className="size-4" aria-hidden="true" /> Take photo
        </button>
        <button type="button" onClick={() => library.current?.click()} className={buttonClass("secondary", "md", "justify-start")}>
          <Images className="size-4" aria-hidden="true" /> Add photos
        </button>
        <button type="button" onClick={() => setRecording(true)} className={buttonClass("secondary", "md", "justify-start")}>
          <Mic className="size-4" aria-hidden="true" /> Recording
        </button>
        <button type="button" onClick={() => doc.current?.click()} className={buttonClass("secondary", "md", "justify-start")}>
          <FileText className="size-4" aria-hidden="true" /> Document
        </button>
        <p className="col-span-full hidden text-center text-xs text-ink-muted md:block">…or drop files here</p>
      </div>
      <UploadProgress items={items} />
      {hasYouTube ? null : (
        <Notice>
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="size-3.5" aria-hidden="true" />
            Private or unlisted video? Upload the recording instead — YouTube links can only be analyzed for public videos.
          </span>
        </Notice>
      )}
      <RecordingSheet sermonId={sermonId} open={recording} onOpenChange={setRecording} />
    </div>
  );
}
