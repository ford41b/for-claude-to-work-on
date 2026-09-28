import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { correctOcr, ocrCorrectionSchema } from "@/lib/pack/corrections";

export const PATCH = route<{ params: Promise<{ id: string }> }>("photos.ocr", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await correctOcr(ctx, id, await readJson(req, ocrCorrectionSchema));
  return json({ ok: true });
});
