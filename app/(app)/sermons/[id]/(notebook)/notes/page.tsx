import type { Metadata } from "next";
import { CaptureList } from "@/components/notes/capture-list";
import { NewNoteButton } from "@/components/notes/new-note-button";
import { NoteEditor } from "@/components/notes/note-editor";
import { requirePageUser } from "@/lib/auth/session";
import { getNotesWithBlocks } from "@/lib/queries/pack";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePageUser(`/sermons/${id}/notes`);
  const [notes, captures] = await Promise.all([
    getNotesWithBlocks(supabase, id),
    supabase
      .from("sermon_moments")
      .select("id, category, title, description, timestamp_start, captured_at")
      .eq("sermon_id", id)
      .eq("origin", "user")
      .eq("hidden", false)
      .order("created_at"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      {notes.map((n, i) => (
        <NoteEditor
          key={n.id}
          noteId={n.id}
          sermonId={id}
          initialTitle={n.title}
          initialContent={n.content}
          initialVersion={n.version}
          autoFocus={i === 0 && !n.plain_text}
          placeholder={i === 0 ? "Write what you're hearing. Use the clock to stamp the sermon's time." : "More notes…"}
        />
      ))}
      <NewNoteButton sermonId={id} />
      <CaptureList sermonId={id} captures={captures.data ?? []} />
    </div>
  );
}
