"use client";

import { EyeOff, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SourceList, TimeLink, VoiceTag, type ChipCitation } from "@/components/sources/source-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";

interface Ref {
  id: string;
  normalized: string;
  raw: string;
  kind: string;
  confidence: string;
  role: string;
  context: string;
  origin: string;
  userEdited: boolean;
  timestamp: number | null;
  citations: ChipCitation[];
}

const KIND: Record<string, string> = {
  explicit: "Cited directly",
  spoken: "Heard in the sermon (spoken reference)",
  allusion: "A story referred to by name",
  inferred: "Suggested by AI from the sources",
};

function RefRow({ r, sermonId }: { r: Ref; sermonId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(r.normalized);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/api/scripture/${r.id}`, { method: "PATCH", body: { reference: value } });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save.");
    }
  };
  const hide = async () => {
    await api(`/api/scripture/${r.id}`, { method: "PATCH", body: { hidden: true } });
    toast.show(`${r.normalized} hidden.`, {
      action: { label: "Undo", onClick: () => void api(`/api/scripture/${r.id}`, { method: "PATCH", body: { hidden: false } }).then(() => router.refresh()) },
    });
    router.refresh();
  };
  return (
    <li className="border-b border-rule py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="reading text-xl font-semibold">{r.normalized}</h3>
        {r.role === "primary" ? <span className="label-caps text-pen">Main text</span> : null}
        {r.origin === "user" ? <VoiceTag voice="you">Added by you</VoiceTag> : r.userEdited ? <VoiceTag voice="you">Corrected by you</VoiceTag> : null}
      </div>
      <p className="mt-0.5 text-sm text-ink-muted">
        {KIND[r.kind] ?? r.kind}
        {r.confidence === "low" ? " · low confidence" : ""}
        {r.raw && r.raw !== r.normalized && r.kind !== "allusion" ? ` · written as “${r.raw}”` : ""}
        {r.timestamp !== null ? (
          <>
            {" · "}
            <TimeLink seconds={r.timestamp} approximate={r.origin !== "user"} />
          </>
        ) : null}
      </p>
      {r.context ? <p className="reading mt-2 leading-relaxed">{r.context}</p> : null}
      {r.citations.length ? <SourceList citations={r.citations} sermonId={sermonId} className="mt-2" /> : null}
      {editing ? (
        <form onSubmit={save} className="mt-3 flex flex-wrap gap-2">
          <label htmlFor={`ref-${r.id}`} className="sr-only">
            Correct reference
          </label>
          <Input id={`ref-${r.id}`} value={value} onChange={(e) => setValue(e.target.value)} className="h-10 max-w-xs" aria-invalid={Boolean(error)} />
          <Button type="submit" size="sm" variant="primary">
            Save
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error ? <p role="alert" className="w-full text-sm text-danger">{error}</p> : null}
        </form>
      ) : (
        <div className="mt-2 flex gap-1">
          <button type="button" onClick={() => setEditing(true)} className="inline-flex h-8 items-center gap-1 rounded-[8px] px-1 text-xs font-semibold text-ink-muted hover:text-pen">
            <Pencil className="size-3" aria-hidden="true" /> Correct
          </button>
          <button type="button" onClick={hide} className="inline-flex h-8 items-center gap-1 rounded-[8px] px-1 text-xs font-semibold text-ink-muted hover:text-pen">
            <EyeOff className="size-3" aria-hidden="true" /> Hide
          </button>
        </div>
      )}
    </li>
  );
}

export function ScriptureList({ sermonId, refs, bibleTextAvailable }: { sermonId: string; refs: Ref[]; bibleTextAvailable: boolean }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sermons/${sermonId}/scripture`, { body: { reference, clientId: crypto.randomUUID() } });
      setReference("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't add that reference.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      {!bibleTextAvailable ? (
        <Notice>References are shown without verse text, because no licensed Bible text provider is configured. We never write out verses from memory.</Notice>
      ) : null}
      <form onSubmit={add} className="flex flex-col gap-2">
        <label htmlFor="add-ref" className="text-sm font-semibold">
          Add a reference
        </label>
        <div className="flex gap-2">
          <Input id="add-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Jn 3:16, Psalm twenty-three, First Corinthians 13" aria-invalid={Boolean(error)} />
          <Button type="submit" variant="primary" loading={busy} disabled={!reference.trim()} className="h-12" icon={<Plus className="size-4" aria-hidden="true" />}>
            Add
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </form>
      {refs.length ? (
        <ul>
          {refs.map((r) => (
            <RefRow key={r.id} r={r} sermonId={sermonId} />
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted">No Scripture found yet. References in your notes, photos, and the sermon appear here automatically.</p>
      )}
    </div>
  );
}
