import { requireUser } from "@/lib/auth/session";
import { notFound } from "@/lib/http/errors";
import { json, route, uuidParam } from "@/lib/http/route";
import { getProcessingStatus } from "@/lib/sermons/status";

export const GET = route<{ params: Promise<{ id: string }> }>("sermons.status", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const { supabase } = await requireUser();
  const status = await getProcessingStatus(supabase, id);
  if (!status) throw notFound("That sermon");
  return json(status);
});
