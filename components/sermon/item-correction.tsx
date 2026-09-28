"use client";

import { EyeOff, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";

/**
 * "Correct" and "Hide" for AI-generated Sermon Pack items. Corrections mark the item
 * user_edited, so rebuilds keep it exactly as the listener left it (lib/pack/persist.ts).
 * Quotes can only be hidden: their words are tied to the evidence they were checked against.
 */

export type CorrectableTable = "main_ideas" | "sermon_sections" | "quotes" | "illustrations" | "terms";

export interface CorrectableField {
  name: "title" | "summary" | "explanation" | "definition";
  label: string;
  value: string;
  multiline?: boolean;
}

const actionClass = "inline-flex h-8 items-center gap-1 rounded-[8px] px-1 text-xs font-semibold text-ink-muted hover:text-pen";

export function ItemCorrection({
  table,
  id,
  itemLabel,
  fields = [],
}: {
  table: CorrectableTable;
  id: string;
  /** Short name for messages, e.g. "Main idea". */
  itemLabel: string;
  fields?: CorrectableField[];
}) {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.value])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/pack-items/${table}/${id}`;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const changed = Object.fromEntries(fields.filter((f) => values[f.name]!.trim() !== f.value.trim()).map((f) => [f.name, values[f.name]!.trim()]));
    if (!Object.keys(changed).length) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(url, { method: "PATCH", body: changed });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save your correction.");
    } finally {
      setBusy(false);
    }
  };

  const hide = async () => {
    try {
      await api(url, { method: "PATCH", body: { hidden: true } });
      toast.show(`${itemLabel} hidden.`, {
        action: { label: "Undo", onClick: () => void api(url, { method: "PATCH", body: { hidden: false } }).then(() => router.refresh()) },
      });
      router.refresh();
    } catch {
      toast.show(`Couldn't hide that ${itemLabel.toLowerCase()}.`);
    }
  };

  if (editing) {
    return (
      <form onSubmit={save} className="mt-3 flex flex-col gap-3 rounded-[12px] border border-rule bg-paper-raised p-3" aria-label={`Correct ${itemLabel.toLowerCase()}`}>
        {fields.map((f) => {
          const inputId = `${formId}-${f.name}`;
          const common = {
            id: inputId,
            value: values[f.name] ?? "",
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
          };
          return (
            <div key={f.name} className="flex flex-col gap-1">
              <label htmlFor={inputId} className="text-sm font-semibold">
                {f.label}
              </label>
              {f.multiline ? <Textarea {...common} rows={3} /> : <Input {...common} />}
            </div>
          );
        })}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="primary" loading={busy}>
            Save correction
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-1 flex gap-1">
      {fields.length ? (
        <button type="button" onClick={() => setEditing(true)} className={actionClass} aria-label={`Correct ${itemLabel.toLowerCase()}`}>
          <Pencil className="size-3" aria-hidden="true" /> Correct
        </button>
      ) : null}
      <button type="button" onClick={hide} className={actionClass} aria-label={`Hide ${itemLabel.toLowerCase()}`}>
        <EyeOff className="size-3" aria-hidden="true" /> Hide
      </button>
    </div>
  );
}
