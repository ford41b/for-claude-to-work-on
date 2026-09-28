import { requireUser } from "@/lib/auth/session";
import { notFound } from "@/lib/http/errors";
import { json, route, uuidParam } from "@/lib/http/route";
import { signedReadUrl, type Bucket } from "@/lib/storage/objects";

/** Short-lived playback URL for a private uploaded recording (after an RLS-checked read). */
export const GET = route<{ params: Promise<{ sourceId: string }> }>("media.url", async (_req, { params }) => {
  const sourceId = uuidParam.parse((await params).sourceId);
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("media_files")
    .select("bucket, path, status, kind")
    .eq("source_id", sourceId)
    .in("kind", ["audio", "video", "document", "photo"])
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("That recording");
  return json({ url: await signedReadUrl(data.bucket as Bucket, data.path, 3 * 3600) });
});
