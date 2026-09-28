import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReviewList } from "@/components/review/review-list";
import { requirePageUser } from "@/lib/auth/session";
import { displayTitle } from "@/lib/sermons/format";

export const metadata: Metadata = { title: "Study" };

const FORMAT_LABEL: Record<string, string> = {
  five_minute: "5-minute",
  fifteen_minute: "15-minute",
  thirty_minute: "30-minute",
  deep: "Deep study",
  small_group: "Small group",
  youth: "Student / youth",
  personal: "Personal",
  family: "Family",
};

export default async function StudyHubPage() {
  const { supabase } = await requirePageUser("/study");
  const [review, saved, guides] = await Promise.all([
    supabase
      .from("review_items")
      .select("id, kind, prompt, detail, status, sermon_id, sermons(title, created_at, preached_on)")
      .in("status", ["new", "review_again"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("review_items")
      .select("id, kind, prompt, detail, status, sermon_id, sermons(title, created_at, preached_on)")
      .eq("status", "saved")
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("study_guides")
      .select("id, title, format, status, sermon_id, created_at, sermons(title, created_at, preached_on)")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  type S = { title: string; created_at: string; preached_on: string | null } | null;
  const toItems = (rows: typeof review.data) =>
    (rows ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      prompt: r.prompt,
      detail: r.detail,
      status: r.status,
      sermonId: r.sermon_id,
      sermonTitle: r.sermons ? displayTitle(r.sermons as NonNullable<S>) : undefined,
      citations: [],
    }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-8">
      <div>
        <h1 className="text-2xl font-bold">Study</h1>
        <p className="mt-2 text-ink-muted">A few things to revisit from recent sermons. Take them at your own pace.</p>
      </div>

      <section aria-labelledby="review-title">
        <h2 id="review-title" className="label-caps mb-3">
          To review
        </h2>
        {review.data?.length ? (
          <ReviewList items={toItems(review.data)} showSermon />
        ) : (
          <p className="text-ink-muted">Nothing waiting. When you finish a sermon, a short set of review items appears here.</p>
        )}
      </section>

      {guides.data?.length ? (
        <section aria-labelledby="guides-title">
          <h2 id="guides-title" className="label-caps mb-3">
            Bible studies
          </h2>
          <ul className="flex flex-col divide-y divide-rule">
            {guides.data.map((g) => (
              <li key={g.id}>
                <Link href={`/sermons/${g.sermon_id}/study?guide=${g.id}`} className="flex items-start gap-3 py-3 hover:text-pen">
                  <BookOpen className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">{g.title}</span>
                    <span className="block text-sm text-ink-muted">
                      {FORMAT_LABEL[g.format] ?? g.format} · {g.sermons ? displayTitle(g.sermons as NonNullable<S>) : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {saved.data?.length ? (
        <section aria-labelledby="saved-title">
          <h2 id="saved-title" className="label-caps mb-3">
            Saved
          </h2>
          <ReviewList items={toItems(saved.data)} showSermon />
        </section>
      ) : null}
    </div>
  );
}
