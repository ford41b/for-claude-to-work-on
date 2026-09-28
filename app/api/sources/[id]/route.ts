import { serviceContext } from "@/lib/http/context";
import { json, route, uuidParam } from "@/lib/http/route";
import { deleteSource } from "@/lib/sermons/service";

export const DELETE = route<{ params: Promise<{ id: string }> }>("sources.delete", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await deleteSource(ctx, id);
  return json({ ok: true });
});
