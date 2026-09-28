import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { correctScripture, scriptureCorrectionSchema } from "@/lib/pack/corrections";

export const PATCH = route<{ params: Promise<{ id: string }> }>("scripture.correct", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await correctScripture(ctx, id, await readJson(req, scriptureCorrectionSchema));
  return json({ ok: true });
});
