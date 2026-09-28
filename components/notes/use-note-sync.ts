"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drafts } from "@/lib/offline/store";

export type SyncStatus = "saved" | "saving" | "local" | "error";

interface ServerNote {
  title: string;
  content: unknown;
  version: number;
}

/**
 * Local-first note persistence:
 *  - every change is written to IndexedDB immediately ("Saved on this device")
 *  - then synced to the server with optimistic concurrency (baseVersion)
 *  - on a version conflict nothing is lost: the local text becomes a separate
 *    "conflicted copy" note and the editor loads the server version
 */
export function useNoteSync(opts: {
  noteId: string;
  sermonId: string;
  initial: ServerNote;
  onReplaceContent: (content: unknown, title: string) => void;
  onConflictCopy: (title: string) => void;
}) {
  const { noteId, sermonId, onReplaceContent, onConflictCopy } = opts;
  const [status, setStatus] = useState<SyncStatus>("saved");
  const version = useRef(opts.initial.version);
  const latest = useRef<{ content: unknown; title: string } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | null>(null);
  const syncRef = useRef<(options?: { keepalive?: boolean }) => Promise<void>>(async () => {});

  const createConflictCopy = useCallback(
    async (content: unknown, title: string) => {
      const copyTitle = `${title || "Notes"} (conflicted copy, ${new Date().toLocaleString()})`.slice(0, 200);
      const res = await fetch(`/api/sermons/${sermonId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: copyTitle, content }),
      });
      if (!res.ok) throw new Error("copy failed");
      onConflictCopy(copyTitle);
    },
    [sermonId, onConflictCopy],
  );

  const sync = useCallback(
    async (options: { keepalive?: boolean } = {}): Promise<void> => {
      if (inFlight.current) return inFlight.current;
      const pending = latest.current;
      if (!pending) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("local");
        return;
      }
      setStatus("saving");
      const run = (async () => {
        try {
          const res = await fetch(`/api/notes/${noteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            keepalive: options.keepalive,
            body: JSON.stringify({
              baseVersion: version.current,
              title: pending.title,
              content: pending.content,
              clientUpdatedAt: new Date().toISOString(),
            }),
          });
          const body = (await res.json().catch(() => null)) as
            | { status: "saved"; version: number }
            | { status: "conflict"; version: number; server: ServerNote }
            | null;
          if (res.ok && body?.status === "saved") {
            version.current = body.version;
            if (latest.current === pending) {
              latest.current = null;
              await drafts.remove(noteId);
              setStatus("saved");
            } else {
              await drafts.put({ noteId, sermonId, ...latest.current!, baseVersion: version.current, dirty: true, updatedAt: Date.now() });
            }
          } else if (res.status === 409 && body?.status === "conflict") {
            await createConflictCopy(pending.content, pending.title);
            version.current = body.server.version;
            latest.current = null;
            await drafts.remove(noteId);
            onReplaceContent(body.server.content, body.server.title);
            setStatus("saved");
          } else {
            setStatus("error");
          }
        } catch {
          setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "local" : "error");
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = run;
      await run;
      if (latest.current && latest.current !== pending) void syncRef.current();
    },
    [noteId, sermonId, createConflictCopy, onReplaceContent],
  );

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const change = useCallback(
    (content: unknown, title: string) => {
      latest.current = { content, title };
      setStatus("local");
      void drafts.put({ noteId, sermonId, title, content, baseVersion: version.current, dirty: true, updatedAt: Date.now() });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void sync(), 1200);
    },
    [noteId, sermonId, sync],
  );

  // Restore unsynced local edits from a previous session (or resolve them as a conflict copy).
  useEffect(() => {
    let cancelled = false;
    void drafts.get(noteId).then(async (draft) => {
      if (cancelled || !draft?.dirty) return;
      if (draft.baseVersion === version.current) {
        latest.current = { content: draft.content, title: draft.title };
        onReplaceContent(draft.content, draft.title);
        void sync();
      } else {
        try {
          await createConflictCopy(draft.content, draft.title);
        } finally {
          await drafts.remove(noteId);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [noteId, onReplaceContent, sync, createConflictCopy]);

  useEffect(() => {
    const onOnline = () => void sync();
    const onHide = () => {
      if (document.visibilityState === "hidden") void sync({ keepalive: true });
    };
    const retry = window.setInterval(() => {
      if (latest.current) void sync();
    }, 20_000);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(retry);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [sync]);

  return { status, change, flush: sync };
}
