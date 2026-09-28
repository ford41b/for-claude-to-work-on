import type { Metadata } from "next";
import { SourceManager, type SourceRow } from "@/components/sources/source-manager";
import { AddSources } from "@/components/upload/add-sources";
import { requirePageUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ source?: string; page?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requirePageUser(`/sermons/${id}/sources`);
  const [{ data: sources }, { data: videos }, { data: docs }] = await Promise.all([
    supabase.from("sermon_sources").select("id, source_type, label, status, error_code, error_message, created_at, processed_at").eq("sermon_id", id).order("created_at"),
    supabase.from("video_sources").select("source_id, origin, youtube_video_id, title, channel_title, privacy_status, metadata_provider, duration_seconds").eq("sermon_id", id),
    supabase.from("documents").select("source_id, title, page_count, pages").eq("sermon_id", id),
  ]);
  const hasYouTube = (videos ?? []).some((v) => v.origin === "youtube");
  const rows: SourceRow[] = (sources ?? []).map((s) => {
    const v = videos?.find((x) => x.source_id === s.id);
    const d = docs?.find((x) => x.source_id === s.id);
    return {
      id: s.id,
      type: s.source_type,
      label: s.label,
      status: s.status,
      errorCode: s.error_code,
      errorMessage: s.error_message,
      createdAt: s.created_at,
      detail: v
        ? v.origin === "youtube"
          ? [v.title, v.channel_title, v.privacy_status !== "unknown" ? `${v.privacy_status} video` : null].filter(Boolean).join(" · ")
          : v.title
        : d
          ? `${d.page_count ?? 0} page${d.page_count === 1 ? "" : "s"}`
          : null,
      youtubeId: v?.youtube_video_id ?? null,
      pages: d ? ((d.pages as { page: number; text: string }[]) ?? []) : null,
    };
  });
  return (
    <div className="flex flex-col gap-10">
      <SourceManager sermonId={id} sources={rows} openSource={sp.source ?? null} openPage={sp.page ? Number(sp.page) : null} />
      <section aria-labelledby="add-sources" className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 id="add-sources" className="label-caps">
          Add evidence
        </h2>
        <AddSources sermonId={id} hasYouTube={hasYouTube} />
      </section>
    </div>
  );
}
