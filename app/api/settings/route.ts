import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { json, readJson, route } from "@/lib/http/route";

const schema = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  textSize: z.enum(["small", "default", "large", "xlarge"]).optional(),
  aiAcknowledged: z.boolean().optional(),
});

export const PATCH = route("settings.update", async (req) => {
  const { supabase, user } = await requireUser();
  const input = await readJson(req, schema);
  if (input.displayName !== undefined) {
    const { error } = await supabase.from("profiles").update({ display_name: input.displayName || null }).eq("id", user.id);
    if (error) throw error;
  }
  const settings: { theme?: string; text_size?: string; ai_processing_acknowledged_at?: string } = {};
  if (input.theme) settings.theme = input.theme;
  if (input.textSize) settings.text_size = input.textSize;
  if (input.aiAcknowledged) settings.ai_processing_acknowledged_at = new Date().toISOString();
  if (Object.keys(settings).length) {
    const { error } = await supabase.from("user_settings").update(settings).eq("user_id", user.id);
    if (error) throw error;
  }
  const jar = await cookies();
  const cookieOpts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  if (input.theme) jar.set("theme", input.theme, cookieOpts);
  if (input.textSize) jar.set("text-size", input.textSize, cookieOpts);
  return json({ ok: true });
});
