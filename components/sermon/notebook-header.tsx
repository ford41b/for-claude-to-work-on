"use client";

import {
  ArrowLeft,
  BookOpen,
  CircleCheck,
  Ellipsis,
  FileText,
  Image as ImageIcon,
  MessageCircleQuestion,
  Pencil,
  Sunrise,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { displayTitle, formatSermonDate } from "@/lib/sermons/format";
import { ProcessingPill } from "./processing";

export interface HeaderSermon {
  id: string;
  title: string;
  speaker: string | null;
  church: string | null;
  series: string | null;
  preached_on: string | null;
  status: "draft" | "finished";
  created_at: string;
}

function DetailsSheet({ sermon, open, onOpenChange }: { sermon: HeaderSermon; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    title: sermon.title,
    speaker: sermon.speaker ?? "",
    church: sermon.church ?? "",
    series: sermon.series ?? "",
    preachedOn: sermon.preached_on ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const patch: Record<string, string | null> = {};
    if (form.title !== sermon.title) patch.title = form.title;
    if (form.speaker !== (sermon.speaker ?? "")) patch.speaker = form.speaker || null;
    if (form.church !== (sermon.church ?? "")) patch.church = form.church || null;
    if (form.series !== (sermon.series ?? "")) patch.series = form.series || null;
    if (form.preachedOn !== (sermon.preached_on ?? "")) patch.preachedOn = form.preachedOn || null;
    try {
      if (Object.keys(patch).length) await api(`/api/sermons/${sermon.id}`, { method: "PATCH", body: patch });
      onOpenChange(false);
      toast.show("Details saved. Your corrections won't be overwritten.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save the details.");
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Sermon details"
      description="What you enter here always wins over details found automatically."
    >
      <form id="details-form" onSubmit={save} className="flex flex-col gap-4">
        <Field label="Title" htmlFor="d-title">
          <Input id="d-title" value={form.title} onChange={set("title")} maxLength={300} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Speaker" htmlFor="d-speaker">
            <Input id="d-speaker" value={form.speaker} onChange={set("speaker")} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Date" htmlFor="d-date">
            <Input id="d-date" type="date" value={form.preachedOn} onChange={set("preachedOn")} />
          </Field>
          <Field label="Church" htmlFor="d-church">
            <Input id="d-church" value={form.church} onChange={set("church")} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Series" htmlFor="d-series">
            <Input id="d-series" value={form.series} onChange={set("series")} maxLength={200} autoComplete="off" />
          </Field>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save details
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function FinishSheet({ sermon, aiLabel, open, onOpenChange }: { sermon: HeaderSermon; aiLabel: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sermons/${sermon.id}/finish`, { method: "POST" });
      onOpenChange(false);
      router.push(`/sermons/${sermon.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't finish the sermon.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Finish sermon" description="We'll bring everything together into your Sermon Pack.">
      <div className="flex flex-col gap-4 text-[0.9375rem]">
        <p>
          Your notes, photos, documents, and the sermon recording (if any) will be organized into a Big Idea, main points, a timeline,
          Scripture, and review items. You can keep editing your notes while this runs — the pack updates afterwards.
        </p>
        {aiLabel ? (
          <Notice title="What gets sent for analysis">
            Your notes, photo text, documents, and the recording or YouTube link are processed by {aiLabel}. Nothing is used to train
            models under the paid API terms. See Profile → Privacy for details.
          </Notice>
        ) : (
          <Notice tone="caution" title="AI processing isn't set up">
            Scripture in your notes will still be found, and everything stays searchable, but no Sermon Pack will be generated.
          </Notice>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Not yet</Button>
          <Button variant="primary" loading={busy} onClick={finish} icon={<CircleCheck className="size-4" aria-hidden="true" />}>
            Finish sermon
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function DeleteSheet({ sermon, open, onOpenChange }: { sermon: HeaderSermon; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/sermons/${sermon.id}`, { method: "DELETE" });
      router.replace("/library");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't delete the sermon.");
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Delete this sermon?">
      <div className="flex flex-col gap-4">
        <p>
          This permanently deletes <strong>{displayTitle(sermon)}</strong>: your notes, photos, uploaded files, and everything generated
          from them. This can’t be undone.
        </p>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Keep it</Button>
          <Button variant="danger" loading={busy} onClick={remove} icon={<Trash2 className="size-4" aria-hidden="true" />}>
            Delete permanently
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "notes", label: "Notes" },
  { seg: "sermon", label: "Sermon" },
  { seg: "study", label: "Study" },
] as const;

const MORE = [
  { seg: "ask", label: "Ask AI", icon: MessageCircleQuestion },
  { seg: "scripture", label: "Scripture", icon: BookOpen },
  { seg: "photos", label: "Photos", icon: ImageIcon },
  { seg: "sources", label: "Sources & uploads", icon: FileText },
  { seg: "sunday", label: "Sunday Mode", icon: Sunrise },
] as const;

export function NotebookHeader({ sermon, aiLabel }: { sermon: HeaderSermon; aiLabel: string | null }) {
  const pathname = usePathname();
  const base = `/sermons/${sermon.id}`;
  const [details, setDetails] = useState(false);
  const [finish, setFinish] = useState(false);
  const [more, setMore] = useState(false);
  const [del, setDel] = useState(false);
  const current = pathname === base ? "" : pathname.slice(base.length + 1).split("/")[0] ?? "";
  const inMore = MORE.some((m) => m.seg === current);
  const meta = [sermon.speaker, sermon.church, formatSermonDate(sermon.preached_on), sermon.series].filter(Boolean);

  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-4 pt-safe">
        <div className="flex items-center justify-between gap-2 pt-3">
          <Link href="/library" className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-[9px] px-2 text-sm font-semibold text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Library
          </Link>
          <div className="flex items-center gap-1">
            {sermon.status === "draft" ? (
              <Button size="sm" variant="primary" onClick={() => setFinish(true)} icon={<CircleCheck className="size-4" aria-hidden="true" />}>
                Finish sermon
              </Button>
            ) : null}
          </div>
        </div>
        <div className="pt-2">
          <h1 className="reading text-2xl font-semibold leading-tight sm:text-3xl">{displayTitle(sermon)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {meta.length ? <p className="text-sm text-ink-muted">{meta.join(" · ")}</p> : null}
            <button
              type="button"
              onClick={() => setDetails(true)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-pen hover:underline"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {meta.length ? "Edit details" : "Add speaker, church, date"}
            </button>
            <ProcessingPill />
          </div>
        </div>
      </header>

      <nav
        aria-label="Sermon notebook"
        className="sticky top-0 z-20 mt-3 border-b border-rule bg-paper/95 backdrop-blur-sm [--notebook-sticky:3.25rem]"
      >
        <ul className="mx-auto flex w-full max-w-6xl items-stretch gap-1 overflow-x-auto px-3 [scrollbar-width:none]">
          {TABS.map((t) => {
            const active = current === t.seg;
            return (
              <li key={t.seg}>
                <Link
                  href={t.seg ? `${base}/${t.seg}` : base}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-12 items-center px-3 text-[0.9375rem] font-semibold",
                    active ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t.label}
                  {active ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-pen" /> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cn(
                "relative inline-flex h-12 items-center gap-1.5 px-3 text-[0.9375rem] font-semibold",
                inMore ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {inMore ? MORE.find((m) => m.seg === current)?.label : "More"}
              <Ellipsis className="size-4" aria-hidden="true" />
              {inMore ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-pen" /> : null}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={more} onOpenChange={setMore} title="More in this notebook">
        <ul className="flex flex-col">
          {MORE.map(({ seg, label, icon: Icon }) => (
            <li key={seg}>
              <Link
                href={`${base}/${seg}`}
                onClick={() => setMore(false)}
                className="flex h-14 items-center gap-3 rounded-[10px] px-2 text-base font-semibold hover:bg-paper-sunk"
              >
                <Icon className="size-5 text-ink-muted" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
          <li className="mt-2 border-t border-rule pt-2">
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setDetails(true);
              }}
              className="flex h-14 w-full items-center gap-3 rounded-[10px] px-2 text-base font-semibold hover:bg-paper-sunk"
            >
              <Pencil className="size-5 text-ink-muted" aria-hidden="true" />
              Edit details
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setDel(true);
              }}
              className="flex h-14 w-full items-center gap-3 rounded-[10px] px-2 text-base font-semibold text-danger hover:bg-danger-wash"
            >
              <Trash2 className="size-5" aria-hidden="true" />
              Delete sermon
            </button>
          </li>
        </ul>
      </Sheet>
      <DetailsSheet key={`${sermon.title}|${sermon.speaker}|${sermon.church}|${sermon.series}|${sermon.preached_on}`} sermon={sermon} open={details} onOpenChange={setDetails} />
      <FinishSheet sermon={sermon} aiLabel={aiLabel} open={finish} onOpenChange={setFinish} />
      <DeleteSheet sermon={sermon} open={del} onOpenChange={setDel} />
    </>
  );
}
