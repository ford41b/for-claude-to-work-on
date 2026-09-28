import { serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { addCapture, captureSchema } from "@/lib/notes/service";

export const POST = route<{ params: Promise<{ id: string }> }>("captures.add", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  return json(await addCapture(ctx, id, await readJson(req, captureSchema)), { status: 201 });
});
