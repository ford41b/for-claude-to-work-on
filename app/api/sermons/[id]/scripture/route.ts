import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { addScripture, addScriptureSchema } from "@/lib/pack/corrections";

export const POST = route<{ params: Promise<{ id: string }> }>("scripture.add", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  return json(await addScripture(ctx, id, await readJson(req, addScriptureSchema)), { status: 201 });
});
