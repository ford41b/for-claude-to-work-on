import { requireUser } from "@/lib/auth/session";
import { notFound } from "@/lib/http/errors";
import { json, route, uuidParam } from "@/lib/http/route";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>("studies.get", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("study_guides").select("id, status, title, error_message, updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("That study");
  return json(data);
});

export const DELETE = route<Ctx>("studies.delete", async (_req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("study_guides").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw notFound("That study");
  return json({ ok: true });
});
