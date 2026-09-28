import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { questionUpdateSchema, updateQuestion } from "@/lib/review/service";

export const PATCH = route<{ params: Promise<{ id: string }> }>("questions.update", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await updateQuestion(ctx, id, await readJson(req, questionUpdateSchema));
  return json({ ok: true });
});
