import { enforceRateLimit } from "@/lib/auth/session";
import { serviceContext } from "@/lib/http/context";
import { json, readJson, route } from "@/lib/http/route";
import { requestUpload, requestUploadSchema } from "@/lib/uploads/service";

export const POST = route("uploads.request", async (req) => {
  const ctx = await serviceContext();
  await enforceRateLimit(ctx.supabase, "upload");
  return json(await requestUpload(ctx, await readJson(req, requestUploadSchema)), { status: 201 });
});
