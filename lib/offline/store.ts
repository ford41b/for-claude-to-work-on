"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * On-device persistence so note-taking never depends on connectivity. Drafts hold the latest
 * local note content; the outbox holds captures and photos made while offline.
 */

export interface NoteDraft {
  noteId: string;
  sermonId: string;
  title: string;
  content: unknown;
  baseVersion: number;
  dirty: boolean;
  updatedAt: number;
}

export type OutboxOp =
  | { id: string; kind: "capture"; sermonId: string; payload: Record<string, unknown>; attempts: number; createdAt: number }
  | {
      id: string;
      kind: "photo";
      sermonId: string;
      file: Blob;
      filename: string;
      mimeType: string;
      capturedAt: string;
      sermonTimestampSeconds: number | null;
      attempts: number;
      createdAt: number;
    };

interface NotebookDB extends DBSchema {
  drafts: { key: string; value: NoteDraft };
  outbox: { key: string; value: OutboxOp; indexes: { bySermon: string } };
}

let dbPromise: Promise<IDBPDatabase<NotebookDB>> | null = null;

function database() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<NotebookDB>("sermon-notebook", 1, {
      upgrade(db) {
        db.createObjectStore("drafts", { keyPath: "noteId" });
        const outbox = db.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("bySermon", "sermonId");
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function safe<T>(fn: (db: IDBPDatabase<NotebookDB>) => Promise<T>, fallback: T): Promise<T> {
  try {
    const p = database();
    if (!p) return fallback;
    return await fn(await p);
  } catch {
    return fallback;
  }
}

export const drafts = {
  get: (noteId: string) => safe((db) => db.get("drafts", noteId), undefined),
  put: (draft: NoteDraft) => safe((db) => db.put("drafts", draft).then(() => true), false),
  remove: (noteId: string) => safe((db) => db.delete("drafts", noteId).then(() => true), false),
};

export const outbox = {
  add: (op: OutboxOp) => safe((db) => db.put("outbox", op).then(() => true), false),
  all: () => safe((db) => db.getAll("outbox"), [] as OutboxOp[]),
  forSermon: (sermonId: string) => safe((db) => db.getAllFromIndex("outbox", "bySermon", sermonId), [] as OutboxOp[]),
  remove: (id: string) => safe((db) => db.delete("outbox", id).then(() => true), false),
  update: (op: OutboxOp) => safe((db) => db.put("outbox", op).then(() => true), false),
};
