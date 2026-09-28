import { z } from "zod";
import { enforceRateLimit } from "@/lib/auth/session";
import { kickWorker, serviceContext } from "@/lib/http/context";
import { json, readJson, route, uuidParam } from "@/lib/http/route";
import { attachYouTube } from "@/lib/sermons/service";

// The background drain (kickWorker) runs inside this function; see DRAIN_FUNCTION_SECONDS.
export const maxDuration = 300;

export const POST = route<{ params: Promise<{ id: string }> }>("sermons.youtube", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  const { url } = await readJson(req, z.object({ url: z.string().trim().min(1).max(2048) }));
  await enforceRateLimit(ctx.supabase, "youtube");
  const result = await attachYouTube(ctx, id, url);
  kickWorker();
  return json(result);
});
