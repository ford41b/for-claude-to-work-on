import { requireUser } from "@/lib/auth/session";
import { integrationStatuses } from "@/lib/integrations/status";
import { json, route } from "@/lib/http/route";

export const GET = route("integrations.status", async () => {
  await requireUser();
  return json({ integrations: integrationStatuses() });
});
