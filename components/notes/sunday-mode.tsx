"use client";

import type { Editor } from "@tiptap/react";
import { Bookmark, BookOpen, Camera, CircleHelp, Star, Wifi, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { PlayerProvider, usePlayer } from "@/components/player/player-context";
import { SermonPlayer } from "@/components/player/sermon-player";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { UploadProgress, useUploader } from "@/components/upload/add-sources";
import { OutboxSync } from "@/components/upload/outbox-sync";
import { outbox } from "@/lib/offline/store";
import { flushOutbox } from "@/lib/offline/sync";
import { NoteEditor } from "./note-editor";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function BigAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[14px] text-[0.8125rem] font-semibold text-ink-muted active:bg-paper-deep hover:bg-paper-raised hover:text-ink"
    >
      {icon}
      {label}
    </button>
  );
}

function SundayInner({ sermonId, title, note, youtube }: { sermonId: string; title: string; note: NonNullable<Props["note"]>; youtube: Props["youtube"] }) {
  const toast = useToast();
  const player = usePlayer();
  const online = useOnline();
  const editor = useRef<Editor | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const { items, upload } = useUploader(sermonId);
  const [sheet, setSheet] = useState<"scripture" | "question" | null>(null);
  const [text, setText] = useState("");

  const onEditor = useCallback((e: Editor | null) => {
    editor.current = e;
  }, []);

  const capture = async (kind: "BOOKMARK" | "IMPORTANT" | "QUESTION", body = "") => {
    const t = player?.ready ? player.currentTime() : null;
    const payload = {
      clientId: crypto.randomUUID(),
      kind,
      text: body,
      timestampSeconds: t !== null ? Math.floor(t) : null,
      capturedAt: new Date().toISOString(),
    };
    // Captures go to the device first, then sync — so they're never lost to church Wi-Fi.
    await outbox.add({ id: payload.clientId, kind: "capture", sermonId, payload, attempts: 0, createdAt: Date.now() });
    void flushOutbox();
    const what = kind === "BOOKMARK" ? "Bookmarked" : kind === "IMPORTANT" ? "Marked important" : "Question saved";
    toast.show(online ? what : `${what} on this device`, { durationMs: 2000 });
  };

  const markImportant = async () => {
    const e = editor.current;
    let body = "";
    if (e) {
      const { $from } = e.state.selection;
      body = $from.parent.textContent.trim().slice(0, 1000);
      if (body) e.chain().focus().setTextSelection({ from: $from.start(), to: $from.end() }).setHighlight().run();
    }
    await capture("IMPORTANT", body);
  };

  const submitScripture = async (ev: FormEvent) => {
    ev.preventDefault();
    const value = text.trim();
    if (!value) return;
    let label = value;
    let osis: string | null = null;
    try {
      const res = await fetch(`/api/sermons/${sermonId}/scripture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: value, clientId: crypto.randomUUID(), timestampStart: player?.ready ? player.currentTime() : null }),
      });
      if (res.ok) {
        const body = (await res.json()) as { normalized: string; osis: string };
        label = body.normalized;
        osis = body.osis;
      } else if (res.status === 400) {
        toast.show("That doesn't look like a Bible reference. Try “John 3:16”.", { tone: "error" });
        return;
      }
    } catch {
      // Offline: keep as typed. It's detected from the note text later.
    }
    editor.current?.chain().focus("end").insertContent([{ type: "scripture", attrs: { label, osis } }, { type: "text", text: " " }]).run();
    setText("");
    setSheet(null);
  };

  const submitQuestion = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!text.trim()) return;
    await capture("QUESTION", text.trim());
    setText("");
    setSheet(null);
  };

  return (
    <div data-surface="sunday" className="flex min-h-dvh flex-col bg-paper text-ink">
      <OutboxSync />
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-rule bg-paper px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href={`/sermons/${sermonId}`} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-semibold text-ink-muted hover:text-ink">
          <X className="size-5" aria-hidden="true" />
          Done
        </Link>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-ink-muted">{title || "Sunday notes"}</p>
        <span className="inline-flex h-11 items-center gap-1.5 px-2 text-xs font-semibold text-ink-muted" role="status">
          {online ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
          <span className="sr-only sm:not-sr-only">{online ? "Online" : "Offline — saving here"}</span>
        </span>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {youtube ? (
          <SermonPlayer
            className="mt-3"
            media={{ kind: "youtube", videoId: youtube.videoId, sourceId: youtube.sourceId, title: youtube.title, thumbnailUrl: null }}
          />
        ) : null}
        <NoteEditor
          noteId={note.id}
          sermonId={sermonId}
          initialTitle={note.title}
          initialContent={note.content}
          initialVersion={note.version}
          compact
          hideTitle
          autoFocus
          placeholder="Listen, then jot what matters…"
          onEditor={onEditor}
          className="[&_.note-editor]:text-lg"
        />
        <div className="mt-4">
          <UploadProgress items={items} />
        </div>
      </main>

      <nav aria-label="Quick capture" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper-sunk pb-safe">
        <div className="mx-auto flex max-w-2xl gap-1 px-2 py-2">
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void upload(files, { kindOverride: "photo" });
            }}
          />
          <BigAction label="Photo" icon={<Camera className="size-6" aria-hidden="true" />} onClick={() => camera.current?.click()} />
          <BigAction label="Scripture" icon={<BookOpen className="size-6" aria-hidden="true" />} onClick={() => setSheet("scripture")} />
          <BigAction label="Bookmark" icon={<Bookmark className="size-6" aria-hidden="true" />} onClick={() => void capture("BOOKMARK")} />
          <BigAction label="Question" icon={<CircleHelp className="size-6" aria-hidden="true" />} onClick={() => setSheet("question")} />
          <BigAction label="Important" icon={<Star className="size-6" aria-hidden="true" />} onClick={() => void markImportant()} />
        </div>
      </nav>

      <Sheet open={sheet === "scripture"} onOpenChange={(o) => !o && setSheet(null)} title="Add Scripture">
        <form onSubmit={submitScripture} className="flex flex-col gap-3">
          <label htmlFor="sunday-ref" className="sr-only">
            Bible reference
          </label>
          <Input id="sunday-ref" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Romans 8:28" className="h-14 text-lg" autoComplete="off" />
          <Button type="submit" variant="primary" size="lg" disabled={!text.trim()}>
            Add to notes
          </Button>
        </form>
      </Sheet>
      <Sheet open={sheet === "question"} onOpenChange={(o) => !o && setSheet(null)} title="A question to come back to">
        <form onSubmit={submitQuestion} className="flex flex-col gap-3">
          <label htmlFor="sunday-q" className="sr-only">
            Your question
          </label>
          <Textarea id="sunday-q" autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-lg" />
          <Button type="submit" variant="primary" size="lg" disabled={!text.trim()}>
            Save question
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

interface Props {
  sermonId: string;
  title: string;
  note: { id: string; title: string; content: unknown; version: number } | null;
  youtube: { videoId: string; sourceId: string; title: string | null } | null;
}

export function SundayMode(props: Props) {
  if (!props.note) {
    return (
      <main id="main" className="mx-auto max-w-md px-5 py-16">
        <p>This notebook has no notes yet.</p>
        <Link href={`/sermons/${props.sermonId}/notes`} className="font-semibold text-pen underline">
          Open notes
        </Link>
      </main>
    );
  }
  return (
    <PlayerProvider available={Boolean(props.youtube)}>
      <SundayInner sermonId={props.sermonId} title={props.title} note={props.note} youtube={props.youtube} />
    </PlayerProvider>
  );
}
