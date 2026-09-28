import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { createNote, createNoteSchema } from "@/lib/notes/service";

export const POST = route<{ params: Promise<{ id: string }> }>("notes.create", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  return json(await createNote(ctx, id, await readJson(req, createNoteSchema)), { status: 201 });
});
