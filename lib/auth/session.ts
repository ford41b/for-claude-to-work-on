import "server-only";
import { redirect } from "next/navigation";
import { rateLimited, unauthorized } from "@/lib/http/errors";
import { RATE_LIMITS, type RateLimitBucket } from "@/lib/config/app";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface AuthedContext {
  supabase: AppSupabaseClient;
  user: SessionUser;
}

async function readUser(supabase: AppSupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { id: data.claims.sub, email };
}

/** For route handlers: returns the user-scoped client or throws 401. */
export async function requireUser(): Promise<AuthedContext> {
  const supabase = await createSupabaseServerClient();
  const user = await readUser(supabase);
  if (!user) throw unauthorized();
  return { supabase, user };
}

/** For server components/pages: redirects to sign-in when there is no session. */
export async function requirePageUser(nextPath?: string): Promise<AuthedContext> {
  const supabase = await createSupabaseServerClient();
  const user = await readUser(supabase);
  if (!user) redirect(nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in");
  return { supabase, user };
}

export async function getOptionalUser(): Promise<AuthedContext | null> {
  const supabase = await createSupabaseServerClient();
  const user = await readUser(supabase);
  return user ? { supabase, user } : null;
}

/** Consumes one unit of a per-user rate limit (Postgres fixed window); throws 429 when exceeded. */
export async function enforceRateLimit(supabase: AppSupabaseClient, bucket: RateLimitBucket): Promise<void> {
  const [limit, windowSeconds] = RATE_LIMITS[bucket];
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  if (data !== true) throw rateLimited();
}
