import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type DB = Database;
export type AppSupabaseClient = SupabaseClient<Database>;
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
