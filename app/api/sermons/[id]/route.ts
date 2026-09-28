import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { deleteSermon, updateSermon, updateSermonSchema } from "@/lib/sermons/service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>("sermons.update", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await updateSermon(ctx, id, await readJson(req, updateSermonSchema));
  return json({ ok: true });
});

export const DELETE = route<Ctx>("sermons.delete", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await deleteSermon(ctx, id);
  return json({ ok: true });
});
