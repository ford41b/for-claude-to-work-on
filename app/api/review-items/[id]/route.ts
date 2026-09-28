import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { reviewActionSchema, updateReviewItem } from "@/lib/review/service";

export const PATCH = route<{ params: Promise<{ id: string }> }>("review.update", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await updateReviewItem(ctx, id, await readJson(req, reviewActionSchema));
  return json({ ok: true });
});
