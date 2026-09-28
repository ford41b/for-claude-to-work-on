import { enforceRateLimit } from "@/lib/auth/session";
import { kickWorker, serviceContext } from "@/lib/http/context";
import { json, route, uuidParam } from "@/lib/http/route";
import { finishSermon } from "@/lib/sermons/service";

// The background drain (kickWorker) runs inside this function; see DRAIN_FUNCTION_SECONDS.
export const maxDuration = 300;

export const POST = route<{ params: Promise<{ id: string }> }>("sermons.finish", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await enforceRateLimit(ctx.supabase, "finish");
  await finishSermon(ctx, id);
  kickWorker();
  return json({ ok: true });
});
