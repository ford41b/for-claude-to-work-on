import { enforceRateLimit } from "@/lib/auth/session";
import { exportAccount } from "@/lib/account/service";
import { serviceContext } from "@/lib/http/context";
import { route } from "@/lib/http/route";

export const GET = route("account.export", async () => {
  const ctx = await serviceContext();
  await enforceRateLimit(ctx.supabase, "export");
  const body = JSON.stringify(await exportAccount(ctx), null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="berean-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
