import { requireUser } from "@/lib/auth/session";
import { kickWorker } from "@/lib/http/context";
import { notFound } from "@/lib/http/errors";
import { json, route, uuidParam } from "@/lib/http/route";
import { getProcessingStatus } from "@/lib/sermons/status";

// The background drain (kickWorker) runs inside this function; see DRAIN_FUNCTION_SECONDS.
export const maxDuration = 300;

const KICK_INTERVAL_MS = 10_000;
const lastKick = new Map<string, number>();

export const GET = route<{ params: Promise<{ id: string }> }>("sermons.status", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const { supabase } = await requireUser();
  const status = await getProcessingStatus(supabase, id);
  if (!status) throw notFound("That sermon");
  // While someone watches a sermon that has work waiting, their polling keeps the queue moving:
  // retries and queued steps start without a separate worker or a frequent cron.
  // Throttled per sermon, since the page polls every few seconds.
  if (status.stages.some((s) => s.state === "pending") && Date.now() - (lastKick.get(id) ?? 0) > KICK_INTERVAL_MS) {
    lastKick.set(id, Date.now());
    if (lastKick.size > 1000) lastKick.clear();
    kickWorker();
  }
  return json(status);
});
