"use client";

import { uploadFile } from "@/lib/client/uploads";
import { outbox, type OutboxOp } from "./store";

let running: Promise<number> | null = null;

/** Replays captures and photos made offline, oldest first. Returns how many were sent. */
export function flushOutbox(): Promise<number> {
  if (running) return running;
  running = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
    const ops = (await outbox.all()).sort((a, b) => a.createdAt - b.createdAt);
    let sent = 0;
    for (const op of ops) {
      try {
        await send(op);
        await outbox.remove(op.id);
        sent++;
      } catch (err) {
        const status = (err as { status?: number }).status;
        // Permanent client errors (e.g. the sermon was deleted) are dropped after a few tries.
        if (status && status >= 400 && status < 500 && op.attempts >= 3) await outbox.remove(op.id);
        else await outbox.update({ ...op, attempts: op.attempts + 1 } as OutboxOp);
        if (!status) break; // network: stop and retry later
      }
    }
    return sent;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function send(op: OutboxOp) {
  if (op.kind === "capture") {
    const res = await fetch(`/api/sermons/${op.sermonId}/captures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op.payload),
    });
    if (!res.ok) throw Object.assign(new Error("capture failed"), { status: res.status });
    return;
  }
  await uploadFile({
    sermonId: op.sermonId,
    kind: "photo",
    file: op.file,
    filename: op.filename,
    mimeType: op.mimeType,
    capturedAt: op.capturedAt,
    sermonTimestampSeconds: op.sermonTimestampSeconds,
  });
}
