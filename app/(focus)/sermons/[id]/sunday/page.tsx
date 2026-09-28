import type { Metadata } from "next";
import { SundayMode } from "@/components/notes/sunday-mode";
import { requirePageUser } from "@/lib/auth/session";
import { getNotebookHeader } from "@/lib/queries/notebook";

export const metadata: Metadata = { title: "Sunday Mode" };

export default async function SundayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}/sunday`);
  const header = await getNotebookHeader(supabase, id);
  const { data: note } = await supabase
    .from("notes")
    .select("id, title, content, version")
    .eq("sermon_id", id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const video = header.video?.origin === "youtube" ? header.video : null;
  return (
    <SundayMode
      sermonId={id}
      title={header.sermon.title}
      note={note ? { id: note.id, title: note.title, content: note.content, version: note.version } : null}
      youtube={video?.youtube_video_id ? { videoId: video.youtube_video_id, sourceId: video.source_id, title: video.title } : null}
    />
  );
}
