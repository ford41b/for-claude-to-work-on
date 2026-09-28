import type { ReactNode } from "react";
import { PlayerProvider } from "@/components/player/player-context";
import { SermonPlayer, type SermonMedia } from "@/components/player/sermon-player";
import { NotebookHeader } from "@/components/sermon/notebook-header";
import { ProcessingProvider, ProcessingStages } from "@/components/sermon/processing";
import { OutboxSync } from "@/components/upload/outbox-sync";
import { requirePageUser } from "@/lib/auth/session";
import { isAIConfigured } from "@/lib/ai/registry";
import { integrationStatuses } from "@/lib/integrations/status";
import { getNotebookHeader } from "@/lib/queries/notebook";
import { getProcessingStatus } from "@/lib/sermons/status";

export default async function NotebookLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}`);
  const [header, status] = await Promise.all([getNotebookHeader(supabase, id), getProcessingStatus(supabase, id)]);
  const { sermon, video, audio } = header;

  let media: SermonMedia | null = null;
  if (video?.origin === "youtube" && video.youtube_video_id) {
    media = { kind: "youtube", videoId: video.youtube_video_id, sourceId: video.source_id, title: video.title, thumbnailUrl: video.thumbnail_url };
  } else if (video?.origin === "upload" && video.source.status !== "pending_upload") {
    media = { kind: "video", sourceId: video.source_id, title: video.title, thumbnailUrl: null };
  } else if (audio && audio.source.status !== "pending_upload") {
    media = { kind: "audio", sourceId: audio.source_id, title: "Uploaded recording", thumbnailUrl: null };
  }
  const ai = integrationStatuses().find((i) => i.id === "ai");

  return (
    <ProcessingProvider sermonId={id} initial={status!}>
      <PlayerProvider available={Boolean(media)}>
        <OutboxSync />
        <NotebookHeader
          sermon={{
            id: sermon.id,
            title: sermon.title,
            speaker: sermon.speaker,
            church: sermon.church,
            series: sermon.series,
            preached_on: sermon.preached_on,
            status: sermon.status,
            created_at: sermon.created_at,
          }}
          aiLabel={isAIConfigured() ? (ai?.name ?? "the configured AI provider") : null}
        />
        <div className="mx-auto grid w-full max-w-6xl gap-x-10 px-4 pb-24 pt-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {media ? (
            <div className="sticky top-[3.25rem] z-10 -mx-4 mb-4 bg-paper px-4 pb-2 lg:top-16 lg:col-start-2 lg:row-start-1 lg:mx-0 lg:mb-0 lg:self-start lg:px-0">
              <SermonPlayer media={media} />
              <ProcessingStages sermonId={id} className="mt-4 hidden lg:block" />
            </div>
          ) : (
            <div className="hidden lg:col-start-2 lg:row-start-1 lg:block lg:self-start">
              <div className="sticky top-16">
                <ProcessingStages sermonId={id} />
              </div>
            </div>
          )}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">{children}</div>
        </div>
      </PlayerProvider>
    </ProcessingProvider>
  );
}
