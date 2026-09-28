import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/auth/session";

export default async function FocusLayout({ children }: { children: ReactNode }) {
  await requirePageUser();
  return children;
}
