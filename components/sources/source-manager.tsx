"use client";

import { ExternalLink, FileText, Image as ImageIcon, Loader, Mic, PenLine, PlayCircle, RotateCw, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";

export interface SourceRow {
  id: string;
  type: string;
  label: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  detail: string | null;
  youtubeId: string | null;
  pages: { page: number; text: string }[] | null;
}

const ICONS: Record<string, typeof Video> = {
  SERMON_VIDEO: PlayCircle,
  UPLOADED_VIDEO: Video,
  UPLOADED_AUDIO: Mic,
  USER_NOTE: PenLine,
  PHOTO: ImageIcon,
  DOCUMENT: FileText,
};

const STATUS_TEXT: Record<string, string> = {
  pending_upload: "Uploading",
  ready: "Saved",
  processing: "Processing",
  processed: "Ready",
  failed: "Failed",
  unavailable: "Can't be analyzed",
};

export function SourceManager({ sermonId, sources, openSource, openPage }: { sermonId: string; sources: SourceRow[]; openSource: string | null; openPage: number | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [doc, setDoc] = useState<SourceRow | null>(sources.find((s) => s.id === openSource && s.pages) ?? null);
  void sermonId;

  const act = async (id: string, action: "retry" | "delete", label: string) => {
    if (action === "delete" && !window.confirm(`Delete ${label}? Its files and anything generated from it are removed.`)) return;
    setBusy(id + action);
    try {
      await api(action === "retry" ? `/api/sources/${id}/retry` : `/api/sources/${id}`, { method: action === "retry" ? "POST" : "DELETE" });
      toast.show(action === "retry" ? "Trying again." : `${label} deleted.`);
      router.refresh();
    } catch (err) {
      toast.show(err instanceof ApiClientError ? err.message : "That didn't work.", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="sources-title">
      <h2 id="sources-title" className="label-caps mb-3">
        Evidence in this notebook
      </h2>
      <ul className="flex flex-col divide-y divide-rule">
        {sources.map((s) => {
          const Icon = ICONS[s.type] ?? FileText;
          const failed = s.status === "failed" || s.status === "unavailable";
          return (
            <li key={s.id} className="flex gap-3 py-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.pages ? (
                    <button type="button" onClick={() => setDoc(s)} className="hover:text-pen hover:underline">
                      {s.label}
                    </button>
                  ) : (
                    s.label
                  )}
                </p>
                {s.detail ? <p className="text-sm text-ink-muted">{s.detail}</p> : null}
                <p className={cn("mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold", failed ? "text-caution" : "text-ink-muted")}>
                  {s.status === "processing" ? <Loader className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                  {STATUS_TEXT[s.status] ?? s.status}
                </p>
                {s.errorMessage ? <p className="mt-0.5 text-sm text-ink-muted">{s.errorMessage}</p> : null}
                {s.youtubeId ? (
                  <a href={`https://www.youtube.com/watch?v=${s.youtubeId}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-pen hover:underline">
                    Open on YouTube <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              {s.type !== "USER_NOTE" ? (
                <div className="flex shrink-0 items-start gap-1">
                  {failed || s.errorCode === "ai_not_configured" || s.status === "processed" ? (
                    <button
                      type="button"
                      aria-label={`Process ${s.label} again`}
                      disabled={busy !== null}
                      onClick={() => act(s.id, "retry", s.label)}
                      className="inline-flex size-10 items-center justify-center rounded-[9px] text-ink-muted hover:bg-paper-sunk hover:text-ink"
                    >
                      <RotateCw className={cn("size-4", busy === s.id + "retry" && "animate-spin")} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Delete ${s.label}`}
                    disabled={busy !== null}
                    onClick={() => act(s.id, "delete", s.label)}
                    className="inline-flex size-10 items-center justify-center rounded-[9px] text-ink-muted hover:bg-danger-wash hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Sheet open={Boolean(doc)} onOpenChange={(o) => !o && setDoc(null)} title={doc?.label ?? "Document"} size="lg">
        <div className="flex flex-col gap-6">
          {doc?.pages?.map((p) => (
            <section key={p.page} id={`page-${p.page}`} aria-label={`Page ${p.page}`} className={cn(openPage === p.page && "rounded-[10px] bg-pen-wash p-3")}>
              <p className="label-caps mb-1">Page {p.page}</p>
              <p className="reading whitespace-pre-line leading-relaxed">{p.text}</p>
            </section>
          ))}
        </div>
      </Sheet>
    </section>
  );
}
