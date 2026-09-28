"use client";

import { Bookmark, Check, EyeOff, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SourceList, type ChipCitation } from "@/components/sources/source-chip";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";

export interface ReviewItemView {
  id: string;
  kind: string;
  prompt: string;
  detail: string;
  status: string;
  sermonId: string;
  sermonTitle?: string;
  citations: ChipCitation[];
}

const KIND_LABEL: Record<string, string> = {
  remember: "Remember",
  scripture: "Scripture to revisit",
  question: "To think about",
  key_idea: "Key idea",
  application: "Try this week",
  confusing: "Worth a second look",
};

const ACTIONS = [
  { status: "reviewed", label: "Reviewed", icon: Check },
  { status: "saved", label: "Save", icon: Bookmark },
  { status: "review_again", label: "Review again", icon: RotateCw },
  { status: "hidden", label: "Hide", icon: EyeOff },
] as const;

/** Review items with gentle actions. No scores, no streaks. */
export function ReviewList({ items, showSermon = false }: { items: ReviewItemView[]; showSermon?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [local, setLocal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, status: string) => {
    setBusy(id);
    const previous = local[id];
    setLocal((s) => ({ ...s, [id]: status }));
    try {
      await api(`/api/review-items/${id}`, { method: "PATCH", body: { status } });
      if (status === "hidden") {
        toast.show("Hidden from your review list.", {
          action: {
            label: "Undo",
            onClick: () => {
              void api(`/api/review-items/${id}`, { method: "PATCH", body: { status: "new" } }).then(() => {
                setLocal((s) => ({ ...s, [id]: "new" }));
                router.refresh();
              });
            },
          },
        });
      }
      router.refresh();
    } catch {
      setLocal((s) => ({ ...s, [id]: previous ?? "" }));
      toast.show("Couldn't update that item. Check your connection.", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const visible = items.filter((i) => (local[i.id] ?? i.status) !== "hidden");
  if (!visible.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {visible.map((item) => {
        const status = local[item.id] ?? item.status;
        return (
          <li key={item.id} className="rounded-[14px] border border-rule bg-paper-raised p-4">
            <p className="label-caps">{KIND_LABEL[item.kind] ?? "Review"}</p>
            <p className="reading mt-1 text-md leading-relaxed">{item.prompt}</p>
            {item.detail ? <p className="mt-1 text-sm text-ink-muted">{item.detail}</p> : null}
            {showSermon && item.sermonTitle ? <p className="mt-2 text-xs font-semibold text-ink-muted">From “{item.sermonTitle}”</p> : null}
            {item.citations.length ? <SourceList citations={item.citations} sermonId={item.sermonId} className="mt-3" /> : null}
            <div role="group" aria-label="Review actions" className="mt-3 flex flex-wrap gap-1.5">
              {ACTIONS.map(({ status: s, label, icon: Icon }) => {
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={busy === item.id}
                    aria-pressed={active}
                    onClick={() => act(item.id, active ? "new" : s)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                      active ? "border-pen bg-pen-wash text-pen" : "border-rule-strong text-ink-muted hover:border-field hover:text-ink",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface ApplicationView {
  id: string;
  text: string;
  detail: string;
  status: "open" | "completed" | "archived";
  origin: "ai" | "user";
  sermonId: string;
  citations: ChipCitation[];
}

export function ApplicationList({ items }: { items: ApplicationView[] }) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, ApplicationView["status"]>>({});
  const toggle = async (a: ApplicationView) => {
    const next = (local[a.id] ?? a.status) === "completed" ? "open" : "completed";
    setLocal((s) => ({ ...s, [a.id]: next }));
    try {
      await api(`/api/applications/${a.id}`, { method: "PATCH", body: { status: next } });
      router.refresh();
    } catch {
      setLocal((s) => ({ ...s, [a.id]: a.status }));
    }
  };
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => {
        const done = (local[a.id] ?? a.status) === "completed";
        return (
          <li key={a.id} className="flex gap-3">
            <input
              id={`app-${a.id}`}
              type="checkbox"
              checked={done}
              onChange={() => toggle(a)}
              className="mt-1 size-5 shrink-0 accent-[var(--pen)]"
            />
            <div className="min-w-0">
              <label htmlFor={`app-${a.id}`} className={cn("font-semibold leading-snug", done && "text-ink-muted line-through decoration-rule-strong")}>
                {a.text}
              </label>
              {a.detail ? <p className="text-sm text-ink-muted">{a.detail}</p> : null}
              {a.origin === "ai" ? <SourceList citations={a.citations} sermonId={a.sermonId} className="mt-1.5" /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
