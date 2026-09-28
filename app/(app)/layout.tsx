import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/lib/auth/session";
import { isFixtureAI } from "@/lib/ai/registry";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePageUser();
  const banner = isFixtureAI() ? (
    <div role="note" className="border-b border-caution/40 bg-caution-wash px-4 py-2 text-center text-sm font-semibold text-ink">
      Test AI provider active — summaries and answers are synthetic, not real analysis.
    </div>
  ) : null;
  return <AppShell banner={banner}>{children}</AppShell>;
}
