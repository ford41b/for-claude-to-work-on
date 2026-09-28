import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { applicationUpdateSchema, updateApplication } from "@/lib/review/service";

export const PATCH = route<{ params: Promise<{ id: string }> }>("applications.update", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await updateApplication(ctx, id, await readJson(req, applicationUpdateSchema));
  return json({ ok: true });
});
