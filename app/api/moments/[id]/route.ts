import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { correctMoment, momentCorrectionSchema } from "@/lib/pack/corrections";

export const PATCH = route<{ params: Promise<{ id: string }> }>("moments.correct", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await correctMoment(ctx, id, await readJson(req, momentCorrectionSchema));
  return json({ ok: true });
});
