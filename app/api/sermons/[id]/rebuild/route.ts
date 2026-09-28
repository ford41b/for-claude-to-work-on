import { enforceRateLimit } from "@/lib/auth/session";
import { kickWorker, serviceContext } from "@/lib/http/context";
import { json, route, uuidParam } from "@/lib/http/route";
import { rebuildPack } from "@/lib/sermons/service";

export const POST = route<{ params: Promise<{ id: string }> }>("sermons.rebuild", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  await enforceRateLimit(ctx.supabase, "rebuild");
  await rebuildPack(ctx, id);
  kickWorker();
  return json({ ok: true });
});
