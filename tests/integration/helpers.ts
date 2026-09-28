import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type { Database } from "@/types/database";

export type TestClient = SupabaseClient<Database>;

export function adminClient(): TestClient {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): TestClient {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: TestClient;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return;
  const admin = adminClient();
  const { data } = await admin.storage.from("photos").list(user.id, { limit: 1000 });
  void data;
  await admin.auth.admin.deleteUser(user.id);
}

let sqlSingleton: postgres.Sql | null = null;
export function sql(): postgres.Sql {
  if (!sqlSingleton) sqlSingleton = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false, onnotice: () => {} });
  return sqlSingleton;
}
export async function closeSql() {
  if (sqlSingleton) await sqlSingleton.end({ timeout: 5 });
  sqlSingleton = null;
}
