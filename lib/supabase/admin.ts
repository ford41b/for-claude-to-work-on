import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/config/env";
import type { Database } from "@/types/database";

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Privileged Supabase client (secret key). Server-only: used for Storage operations the user
 * cannot perform directly (reading originals in the worker, writing derived previews,
 * account deletion) and Auth admin. Never import from client components.
 */
export function supabaseAdmin() {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin() must not run in the browser");
  if (!adminClient) {
    const env = serverEnv();
    adminClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}
