import { BookOpen, CircleHelp, Plus, Sunrise } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SermonRow, type SermonRowData } from "@/components/library/sermon-row";
import { ReviewList } from "@/components/review/review-list";
import { displayTitle } from "@/lib/sermons/format";
import { Greeting } from "@/components/shell/greeting";
import { ButtonLink } from "@/components/ui/button";
import { requirePageUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const { supabase, user } = await requirePageUser("/home");
  const [profile, sermons, review, questions, scripture] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("sermons").select("id, title, speaker, church, preached_on, created_at, status, big_idea, updated_at").order("updated_at", { ascending: false }).limit(6),
    supabase
      .from("review_items")
      .select("id, kind, prompt, detail, status, sermon_id, sermons(title, created_at, preached_on)")
      .in("status", ["new", "review_again"])
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.from("questions").select("id, text, sermon_id, sermons(title)").eq("origin", "user").eq("status", "open").eq("hidden", false).order("created_at", { ascending: false }).limit(4),
    supabase.from("scripture_references").select("normalized_reference, book, chapter_start, sermon_id").eq("hidden", false).order("created_at", { ascending: false }).limit(40),
  ]);
  const list = (sermons.data ?? []) as (SermonRowData & { updated_at: string })[];
  const continueSermon = list.find((s) => s.status === "draft") ?? null;
  const recent = list.filter((s) => s.id !== continueSermon?.id).slice(0, 5);
  const refs = [...new Map((scripture.data ?? []).map((r) => [r.normalized_reference, r])).values()].slice(0, 8);

  if (!list.length) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-8">
        <Greeting name={profile.data?.display_name ?? null} />
        <p className="reading mt-4 max-w-prose text-lg leading-relaxed text-ink-muted">
          Keep each sermon in its own notebook: your notes, photos of the slides, the video if there is one — then get a study summary that
          shows exactly where every point came from.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/sermons/new" variant="primary" size="lg" icon={<Plus className="size-5" aria-hidden="true" />}>
            New sermon
          </ButtonLink>
        </div>
        <ol className="mt-12 flex flex-col gap-6 border-t border-rule pt-8">
          {[
            ["Capture", "Take notes in Sunday Mode, photograph slides, bookmark moments. Everything saves on your phone first."],
            ["Finish", "Tap Finish sermon. The recording, your notes, and photos become one Sermon Pack."],
            ["Study", "Jump to any moment, ask questions with sources, and create a Bible study for the week."],
          ].map(([t, d]) => (
            <li key={t}>
              <p className="font-bold">{t}</p>
              <p className="text-ink-muted">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Greeting name={profile.data?.display_name ?? null} />
        <ButtonLink href="/sermons/new" variant="primary" icon={<Plus className="size-4" aria-hidden="true" />}>
          New sermon
        </ButtonLink>
      </div>

      {continueSermon ? (
        <section aria-labelledby="continue-title" className="rounded-[16px] border border-rule bg-paper-raised p-5">
          <h2 id="continue-title" className="label-caps">
            Continue
          </h2>
          <p className="reading mt-2 text-xl font-semibold">{displayTitle(continueSermon)}</p>
          <p className="mt-1 text-sm text-ink-muted">In progress — finish it when the sermon ends to build your Sermon Pack.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/sermons/${continueSermon.id}/notes`} variant="secondary">
              Open notes
            </ButtonLink>
            <ButtonLink href={`/sermons/${continueSermon.id}/sunday`} variant="quiet" icon={<Sunrise className="size-4" aria-hidden="true" />}>
              Sunday Mode
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {review.data?.length ? (
        <section aria-labelledby="week-title">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="week-title" className="label-caps">
              This week
            </h2>
            <Link href="/study" className="text-sm font-semibold text-pen hover:underline">
              All review
            </Link>
          </div>
          <ReviewList
            showSermon
            items={review.data.map((r) => ({
              id: r.id,
              kind: r.kind,
              prompt: r.prompt,
              detail: r.detail,
              status: r.status,
              sermonId: r.sermon_id,
              sermonTitle: r.sermons ? displayTitle(r.sermons as { title: string; created_at: string; preached_on: string | null }) : undefined,
              citations: [],
            }))}
          />
        </section>
      ) : null}

      <section aria-labelledby="recent-title">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 id="recent-title" className="label-caps">
            Recent sermons
          </h2>
          <Link href="/library" className="text-sm font-semibold text-pen hover:underline">
            Library
          </Link>
        </div>
        <ul>
          {(continueSermon ? recent : list.slice(0, 5)).map((s) => (
            <SermonRow key={s.id} s={s} />
          ))}
        </ul>
      </section>

      {refs.length ? (
        <section aria-labelledby="scripture-title">
          <h2 id="scripture-title" className="label-caps mb-3">
            Scripture from your sermons
          </h2>
          <ul className="flex flex-wrap gap-2">
            {refs.map((r) => (
              <li key={r.normalized_reference}>
                <Link
                  href={`/library?q=${encodeURIComponent(r.normalized_reference)}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rule-strong px-3 text-sm font-semibold hover:border-pen hover:text-pen"
                >
                  <BookOpen className="size-3.5" aria-hidden="true" />
                  {r.normalized_reference}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {questions.data?.length ? (
        <section aria-labelledby="questions-title">
          <h2 id="questions-title" className="label-caps mb-3">
            Your open questions
          </h2>
          <ul className="flex flex-col gap-2">
            {questions.data.map((q) => (
              <li key={q.id}>
                <Link href={`/sermons/${q.sermon_id}/ask`} className="flex gap-2 rounded-[10px] p-2 hover:bg-paper-sunk">
                  <CircleHelp className="mt-0.5 size-4 shrink-0 text-pen" aria-hidden="true" />
                  <span>
                    {q.text}
                    <span className="block text-xs text-ink-muted">{(q.sermons as { title: string } | null)?.title || "Untitled sermon"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
