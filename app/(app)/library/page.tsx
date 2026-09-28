import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SermonRow, Snippet, type SermonRowData } from "@/components/library/sermon-row";
import { ButtonLink } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { requirePageUser } from "@/lib/auth/session";
import { BIBLE_BOOKS, getBook } from "@/lib/bible/books";
import { normalizeReference } from "@/lib/bible/reference";
import { cn } from "@/lib/client/cn";
import { SERMON_ROW_COLUMNS } from "@/lib/sermons/format";
import { VERSES } from "@/lib/bible/verses";
import { Verse } from "@/components/scripture/verse";

export const metadata: Metadata = { title: "Library" };

const MATCH_LABEL: Record<string, string> = {
  sermon: "title or summary",
  title: "title",
  notes: "your notes",
  photos: "photo text",
  documents: "documents",
  ideas: "main ideas",
  quotes: "quotes",
  scripture: "Scripture",
};

type SP = { q?: string; speaker?: string; church?: string; series?: string; book?: string; from?: string; to?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requirePageUser("/library");
  const q = sp.q?.trim().slice(0, 200) || "";
  // A query that is itself a Scripture reference also filters by book/chapter.
  const asRef = q ? normalizeReference(q) : null;
  const book = sp.book && getBook(sp.book) ? sp.book : asRef?.kind === "explicit" || asRef?.kind === "spoken" ? asRef.book : null;
  const chapter = !sp.book && asRef && (asRef.kind === "explicit" || asRef.kind === "spoken") ? asRef.chapterStart : null;
  const filtering = Boolean(q || sp.speaker || sp.church || sp.series || book || sp.from || sp.to);

  const [results, facets] = await Promise.all([
    supabase.rpc("search_library", {
      p_query: asRef && (asRef.kind === "explicit" || asRef.kind === "spoken") ? undefined : q || undefined,
      p_speaker: sp.speaker || undefined,
      p_church: sp.church || undefined,
      p_series: sp.series || undefined,
      p_book: book ?? undefined,
      p_chapter: chapter ?? undefined,
      p_from: sp.from || undefined,
      p_to: sp.to || undefined,
      p_limit: 100,
    }),
    supabase.from("sermons").select("speaker, church, series"),
  ]);
  if (results.error) throw results.error;
  const ids = (results.data ?? []).map((r) => r.sermon_id);
  const { data: sermons } = ids.length
    ? await supabase.from("sermons").select(SERMON_ROW_COLUMNS).in("id", ids)
    : { data: [] as SermonRowData[] };
  const byId = new Map((sermons ?? []).map((s) => [s.id, s as SermonRowData]));
  const ordered = filtering
    ? (results.data ?? []).map((r) => ({ r, s: byId.get(r.sermon_id) })).filter((x) => x.s)
    : [...(sermons ?? [])]
        .sort((a, b) => (b.preached_on ?? b.created_at).localeCompare(a.preached_on ?? a.created_at))
        .map((s) => ({ r: null, s: s as SermonRowData }));

  const distinct = (k: "speaker" | "church" | "series") => [...new Set((facets.data ?? []).map((f) => f[k]).filter((v): v is string => Boolean(v)))].sort();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Library</h1>
        <ButtonLink href="/sermons/new" variant="primary" icon={<Plus className="size-4" aria-hidden="true" />}>
          New sermon
        </ButtonLink>
      </div>

      <form role="search" action="/library" className="flex flex-col gap-3">
        <label htmlFor="lib-q" className="sr-only">
          Search your sermons
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            id="lib-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search notes, photos, ideas, quotes, or a passage like Romans 8"
            className={cn(fieldClass, "h-12 pl-10 text-base")}
          />
        </div>
        <details className="group rounded-[12px] border border-rule" open={Boolean(sp.speaker || sp.church || sp.series || sp.book || sp.from || sp.to)}>
          <summary className="flex h-11 cursor-pointer list-none items-center px-3 text-sm font-semibold text-ink-muted [&::-webkit-details-marker]:hidden">Filters</summary>
          <div className="grid gap-3 border-t border-rule p-3 sm:grid-cols-3">
            {(["speaker", "church", "series"] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm font-semibold">
                {k[0]!.toUpperCase() + k.slice(1)}
                <select name={k} defaultValue={sp[k] ?? ""} className={cn(fieldClass, "h-11 text-sm")}>
                  <option value="">Any</option>
                  {distinct(k).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Bible book
              <select name="book" defaultValue={sp.book ?? ""} className={cn(fieldClass, "h-11 text-sm")}>
                <option value="">Any</option>
                {BIBLE_BOOKS.map((b) => (
                  <option key={b.osis} value={b.osis}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              From
              <input type="date" name="from" defaultValue={sp.from ?? ""} className={cn(fieldClass, "h-11 text-sm")} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              To
              <input type="date" name="to" defaultValue={sp.to ?? ""} className={cn(fieldClass, "h-11 text-sm")} />
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" className="h-10 rounded-[9px] bg-pen px-4 text-sm font-semibold text-on-pen">
                Apply
              </button>
              <Link href="/library" className="inline-flex h-10 items-center rounded-[9px] px-3 text-sm font-semibold text-ink-muted hover:text-ink">
                Clear
              </Link>
            </div>
          </div>
        </details>
      </form>

      {asRef && book ? (
        <p className="text-sm text-ink-muted">
          Showing sermons that use <strong className="text-ink">{chapter ? `${getBook(book)?.singular ?? getBook(book)?.name} ${chapter}` : getBook(book)?.name}</strong>.
        </p>
      ) : null}

      {ordered.length ? (
        <ul aria-label={filtering ? "Search results" : "All sermons"}>
          {ordered.map(({ r, s }) => (
            <SermonRow
              key={s!.id}
              s={s!}
              extra={
                r && r.matched_in?.length ? (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Found in {r.matched_in.map((m) => MATCH_LABEL[m] ?? m).join(", ")}
                    {r.snippet ? (
                      <span className="mt-1 block text-sm">
                        <Snippet text={r.snippet} />
                      </span>
                    ) : null}
                  </p>
                ) : null
              }
            />
          ))}
        </ul>
      ) : filtering ? (
        <p className="text-ink-muted">No sermons match. Try fewer words, or a passage like “John 3”.</p>
      ) : (
        <div className="flex flex-col items-start gap-4 py-6">
          <p className="text-ink-muted">Your sermon notebooks will appear here.</p>
          <Verse verse={VERSES.hidden} size="sm" />
          <ButtonLink href="/sermons/new" variant="primary">
            Start your first sermon
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
