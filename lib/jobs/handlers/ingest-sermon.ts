import { serverEnv } from "@/lib/config/env";
import { isAIConfigured } from "@/lib/ai/registry";
import { AI_ERROR_MESSAGES } from "@/lib/ai/errors";
import { fetchVideoMetadata, youtubeThumbnailFallback, type VideoMetadata } from "@/lib/youtube/metadata";

const OFFLINE_METADATA: VideoMetadata = {
  provider: "none",
  found: true,
  title: null,
  channelTitle: null,
  thumbnailUrl: null,
  publishedAt: null,
  durationSeconds: null,
  privacyStatus: "unknown",
  embeddable: null,
  liveStatus: "unknown",
  ageRestricted: null,
};
import { hashJson } from "@/lib/hash";
import { applyProviderMetadata } from "@/lib/sermons/metadata";
import { PermanentJobError, type JobHandler } from "../context";
import { enqueueJob } from "../queue";
import { maybeScheduleSynthesis } from "../pipeline";

/**
 * INGEST_SERMON: loads official metadata for a YouTube source, decides whether direct analysis
 * is possible (public, not live), and schedules ANALYZE_VIDEO. Never blocks note-taking.
 */
export const ingestSermon: JobHandler = async ({ job, sql, progress }) => {
  if (!job.source_id) throw new PermanentJobError("bad_job", "Missing source.");
  const [video] = await sql<{ youtube_video_id: string | null; original_url: string | null; origin: string }[]>`
    select youtube_video_id, original_url, origin from public.video_sources where source_id = ${job.source_id}`;
  if (!video?.youtube_video_id) throw new PermanentJobError("not_found", "This video source no longer exists.");

  await progress("Looking up the video", 20);
  const env = serverEnv();
  const meta =
    env.YOUTUBE_METADATA === "off"
      ? { ...OFFLINE_METADATA }
      : await fetchVideoMetadata(video.youtube_video_id, { apiKey: env.YOUTUBE_API_KEY });

  await sql`
    update public.video_sources
       set title = coalesce(${meta.title}, title),
           channel_title = coalesce(${meta.channelTitle}, channel_title),
           thumbnail_url = coalesce(${meta.thumbnailUrl}, thumbnail_url, ${youtubeThumbnailFallback(video.youtube_video_id)}),
           published_at = coalesce(${meta.publishedAt}::timestamptz, published_at),
           duration_seconds = coalesce(${meta.durationSeconds}, duration_seconds),
           privacy_status = ${meta.privacyStatus},
           embeddable = ${meta.embeddable},
           live_status = ${meta.liveStatus},
           age_restricted = ${meta.ageRestricted},
           metadata_provider = ${meta.provider},
           metadata_fetched_at = now()
     where source_id = ${job.source_id}`;

  await applyProviderMetadata(sql, job.sermon_id!, {
    title: meta.title,
    church: meta.channelTitle,
    preachedOn: meta.publishedAt ? meta.publishedAt.slice(0, 10) : null,
  });

  const contentHash = hashJson({ videoId: video.youtube_video_id });
  const blocked =
    !meta.found
      ? { code: "media_unavailable", message: "This video couldn't be found. It may be private, removed, or the link may be wrong." }
      : meta.privacyStatus === "private" || meta.privacyStatus === "unlisted"
        ? { code: "media_private", message: AI_ERROR_MESSAGES.media_private }
        : meta.liveStatus === "live" || meta.liveStatus === "upcoming"
          ? { code: "live_in_progress", message: "This livestream hasn't finished yet. Analysis will start when you finish the sermon after the stream ends." }
          : null;

  if (blocked) {
    await sql`
      update public.sermon_sources
         set status = ${blocked.code === "live_in_progress" ? "ready" : "unavailable"},
             error_code = ${blocked.code}, error_message = ${blocked.message}, content_hash = ${contentHash}
       where id = ${job.source_id}`;
    await maybeScheduleSynthesis(sql, job.sermon_id!);
    return { result: { eligible: false, reason: blocked.code, metadata_provider: meta.provider } };
  }

  if (!isAIConfigured()) {
    await sql`
      update public.sermon_sources
         set status = 'ready', error_code = 'ai_not_configured', error_message = ${AI_ERROR_MESSAGES.not_configured},
             content_hash = ${contentHash}
       where id = ${job.source_id}`;
    await maybeScheduleSynthesis(sql, job.sermon_id!);
    return { result: { eligible: true, analysis: "skipped_ai_not_configured" } };
  }

  await sql`
    update public.sermon_sources set status = 'processing', error_code = null, error_message = null, content_hash = ${contentHash}
     where id = ${job.source_id}`;
  await enqueueJob(sql, {
    userId: job.user_id,
    sermonId: job.sermon_id,
    sourceId: job.source_id,
    type: "ANALYZE_VIDEO",
    dedupeKey: `ANALYZE_VIDEO:${job.source_id}`,
    payload: job.payload.force ? { force: true } : {},
  });
  return { result: { eligible: true, metadata_provider: meta.provider } };
};
