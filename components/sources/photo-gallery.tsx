"use client";

import { ImageOff, Pencil, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TimeLink, VoiceTag } from "@/components/sources/source-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import type { PhotoView } from "@/lib/queries/notebook";

type Block = { type: string; text: string; confidence: string; unclear: boolean };

const CONFIDENCE_TEXT: Record<string, string> = {
  high: "Read clearly",
  medium: "Mostly readable",
  low: "We're not completely sure about this text.",
};

function PhotoDetail({ photo, onClose }: { photo: PhotoView; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(photo.ocr?.full_text ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blocks = (photo.ocr?.blocks as Block[] | null) ?? [];
  const isUserVersion = photo.ocr?.origin === "user";

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      toast.show(success);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That didn't work. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-[12px] border border-rule bg-paper-sunk">
        {photo.originalUrl || photo.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.originalUrl ?? photo.previewUrl!} alt={`${photo.label} — original photo`} className="max-h-[55vh] w-full object-contain" />
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-ink-muted">
            <ImageOff className="size-5" aria-hidden="true" />
            Preview unavailable for this format. The original is kept.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
        {photo.sermonTimestamp !== null ? (
          <span>
            Taken at <TimeLink seconds={photo.sermonTimestamp} approximate={false} /> in the sermon
          </span>
        ) : null}
        {photo.capturedAt ? <span>{new Date(photo.capturedAt).toLocaleString()}</span> : null}
      </div>

      <section aria-labelledby="ocr-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ocr-title" className="label-caps">
            Text in this photo
          </h3>
          {photo.ocr ? isUserVersion ? <VoiceTag voice="you">Corrected by you</VoiceTag> : <VoiceTag voice="ai">Read by AI</VoiceTag> : null}
        </div>
        {photo.status === "processing" ? (
          <p className="text-sm text-ink-muted">Reading this photo…</p>
        ) : photo.errorMessage && !photo.ocr ? (
          <Notice tone="caution">{photo.errorMessage}</Notice>
        ) : null}
        {photo.ocr && !isUserVersion && photo.ocr.overall_confidence ? (
          <p className={cn("text-sm", photo.ocr.overall_confidence === "low" ? "font-semibold text-caution" : "text-ink-muted")}>
            {CONFIDENCE_TEXT[photo.ocr.overall_confidence]}
            {photo.ocr.legibility_note ? ` ${photo.ocr.legibility_note}` : ""}
          </p>
        ) : null}
        {editing ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="ocr-text" className="sr-only">
              Photo text
            </label>
            <Textarea id="ocr-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} className="font-read" />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy === "save"}
                onClick={async () => {
                  const ok = await run("save", () => api(`/api/photos/${photo.sourceId}/ocr`, { method: "PATCH", body: { text } }), "Saved. Your version is used from now on.");
                  if (ok) setEditing(false);
                }}
              >
                Save text
              </Button>
            </div>
          </div>
        ) : photo.ocr?.full_text ? (
          isUserVersion || !blocks.length ? (
            <p className="reading whitespace-pre-line leading-relaxed">{photo.ocr.full_text}</p>
          ) : (
            <div className="reading flex flex-col gap-1.5 leading-relaxed">
              {blocks.map((b, i) => (
                <p
                  key={i}
                  className={cn(b.type === "heading" && "font-semibold", b.unclear && "rounded-[4px] bg-caution-wash px-1")}
                  title={b.unclear ? "Part of this line couldn't be read with confidence" : undefined}
                >
                  {b.type === "list_item" ? "• " : ""}
                  {b.text}
                  {b.unclear ? <span className="sr-only"> (uncertain reading)</span> : null}
                </p>
              ))}
            </div>
          )
        ) : photo.ocr ? (
          <p className="text-sm text-ink-muted">{isUserVersion ? "You chose to use the original image only." : "No text was found."}</p>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Pencil className="size-4" aria-hidden="true" />} onClick={() => setEditing(true)}>
              Edit text
            </Button>
            <Button
              size="sm"
              icon={<RotateCw className="size-4" aria-hidden="true" />}
              loading={busy === "retry"}
              onClick={() => run("retry", () => api(`/api/sources/${photo.sourceId}/retry`, { method: "POST" }), "Reading the photo again.")}
            >
              Read again
            </Button>
            <Button
              size="sm"
              variant="quiet"
              loading={busy === "original"}
              onClick={() => run("original", () => api(`/api/photos/${photo.sourceId}/ocr`, { method: "PATCH", body: { text: "" } }), "This photo's text won't be used. The image is kept.")}
            >
              Use original image only
            </Button>
          </div>
        ) : null}
      </section>

      <div className="border-t border-rule pt-4">
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          loading={busy === "delete"}
          onClick={async () => {
            if (!window.confirm(`Delete ${photo.label}? The image and its text are removed permanently.`)) return;
            const ok = await run("delete", () => api(`/api/sources/${photo.sourceId}`, { method: "DELETE" }), "Photo deleted.");
            if (ok) onClose();
          }}
        >
          Delete photo
        </Button>
      </div>
    </div>
  );
}

export function PhotoGallery({ photos, initialOpen }: { sermonId: string; photos: PhotoView[]; initialOpen: string | null }) {
  const [open, setOpen] = useState<string | null>(initialOpen && photos.some((p) => p.sourceId === initialOpen) ? initialOpen : null);
  const current = photos.find((p) => p.sourceId === open) ?? null;
  if (!photos.length) {
    return <p className="text-ink-muted">No photos yet. Photograph slides, handouts, or your handwritten notes — the originals are always kept.</p>;
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li key={p.sourceId}>
            <button type="button" onClick={() => setOpen(p.sourceId)} className="group block w-full text-left">
              <div className="aspect-[4/3] overflow-hidden rounded-[12px] border border-rule bg-paper-sunk">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl} alt="" className="size-full object-cover transition-opacity group-hover:opacity-90" loading="lazy" />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-ink-muted">{p.status === "processing" ? "Processing…" : "No preview"}</span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-semibold">{p.label}</p>
              <p className="line-clamp-2 text-xs text-ink-muted">
                {p.ocr?.title || p.ocr?.full_text?.split("\n")[0] || (p.status === "processing" ? "Reading…" : p.errorMessage ?? "")}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={Boolean(current)} onOpenChange={(o) => !o && setOpen(null)} title={current?.label ?? "Photo"} size="lg">
        {current ? <PhotoDetail key={current.sourceId + (current.ocr?.version ?? 0)} photo={current} onClose={() => setOpen(null)} /> : null}
      </Sheet>
    </>
  );
}
