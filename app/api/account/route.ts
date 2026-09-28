import { z } from "zod";
import { deleteAccount } from "@/lib/account/service";
import { serviceContext } from "@/lib/http/context";
import { json, readJson, route } from "@/lib/http/route";

export const DELETE = route("account.delete", async (req) => {
  const ctx = await serviceContext();
  const { confirmation } = await readJson(req, z.object({ confirmation: z.string() }));
  await deleteAccount(ctx, confirmation);
  await ctx.supabase.auth.signOut().catch(() => {});
  return json({ ok: true });
});
