import { serviceContext } from "@/lib/http/context";
import { notFound } from "@/lib/http/errors";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { saveNote, saveNoteSchema } from "@/lib/notes/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>("notes.get", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  const { data, error } = await ctx.supabase.from("notes").select("id, title, content, version, updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("That note");
  return json(data);
});

export const PUT = route<Ctx>("notes.save", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  const result = await saveNote(ctx, id, await readJson(req, saveNoteSchema));
  return json(result, { status: result.status === "conflict" ? 409 : 200 });
});
