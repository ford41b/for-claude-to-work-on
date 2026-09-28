import { enforceRateLimit } from "@/lib/auth/session";
import { kickWorker, serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { requestStudy, requestStudySchema } from "@/lib/study/service";

// The background drain (kickWorker) runs inside this function; see DRAIN_FUNCTION_SECONDS.
export const maxDuration = 300;

export const POST = route<{ params: Promise<{ id: string }> }>("studies.create", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  const input = await readJson(req, requestStudySchema);
  await enforceRateLimit(ctx.supabase, "study");
  const result = await requestStudy(ctx, id, input);
  kickWorker();
  return json(result, { status: 201 });
});
