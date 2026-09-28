import type { Metadata } from "next";
import { ProfileSettings } from "@/components/shell/profile-settings";
import { requirePageUser } from "@/lib/auth/session";
import { integrationStatuses } from "@/lib/integrations/status";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, user } = await requirePageUser("/profile");
  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("theme, text_size").eq("user_id", user.id).maybeSingle(),
  ]);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-8">
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
      <ProfileSettings
        displayName={profile?.display_name ?? ""}
        theme={(settings?.theme as "system" | "light" | "dark") ?? "system"}
        textSize={(settings?.text_size as "small" | "default" | "large" | "xlarge") ?? "default"}
        integrations={integrationStatuses()}
      />
    </div>
  );
}
