import { kickWorker, serviceContext } from "@/lib/http/context";
import { json, route, uuidParam } from "@/lib/http/route";
import { completeUpload } from "@/lib/uploads/service";

export const POST = route<{ params: Promise<{ id: string }> }>("uploads.complete", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  const result = await completeUpload(ctx, id);
  kickWorker();
  return json(result);
});
