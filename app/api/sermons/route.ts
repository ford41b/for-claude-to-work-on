import { enforceRateLimit } from "@/lib/auth/session";
import { kickWorker, serviceContext } from "@/lib/http/context";
import { json, readJson, route } from "@/lib/http/route";
import { createSermon, createSermonSchema } from "@/lib/sermons/service";

// The background drain (kickWorker) runs inside this function; see DRAIN_FUNCTION_SECONDS.
export const maxDuration = 300;

export const POST = route("sermons.create", async (req) => {
  const ctx = await serviceContext();
  const input = await readJson(req, createSermonSchema);
  if (input.youtubeUrl) await enforceRateLimit(ctx.supabase, "youtube");
  const created = await createSermon(ctx, input);
  if (input.youtubeUrl) kickWorker();
  return json(created, { status: 201 });
});
