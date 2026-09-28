import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config/app";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 pt-safe">
        <Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold tracking-tight text-ink">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-pen" />
          {APP_NAME}
        </Link>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        {children}
      </main>
    </div>
  );
}
