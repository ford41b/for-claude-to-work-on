import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/lib/auth/session";
import { isFixtureAI } from "@/lib/ai/registry";
import { displayTitle } from "@/lib/sermons/format";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase } = await requirePageUser();
  const { data: recent } = await supabase.from("sermons").select("id, title, status, preached_on, created_at").order("updated_at", { ascending: false }).limit(5);
  const banner = isFixtureAI() ? (
    <div role="note" className="border-b border-caution/40 bg-caution-wash px-4 py-2 text-center text-sm font-semibold text-ink">
      Test AI provider active — summaries and answers are synthetic, not real analysis.
    </div>
  ) : null;
  return (
    <AppShell banner={banner} recent={(recent ?? []).map((s) => ({ id: s.id, title: displayTitle(s), status: s.status }))}>
      {children}
    </AppShell>
  );
}
