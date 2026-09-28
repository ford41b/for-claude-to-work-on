"use client";

import { BookOpen, GraduationCap, House, Library, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config/app";
import { cn } from "@/lib/client/cn";

const NAV = [
  { href: "/home", label: "Home", icon: House },
  { href: "/library", label: "Library", icon: Library },
  { href: "/study", label: "Study", icon: GraduationCap },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  const pathname = usePathname();
  // Inside a notebook the notebook's own navigation takes over on phones.
  const inNotebook = pathname.startsWith("/sermons/");

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-rule px-4 py-6 md:flex">
        <Link href="/home" className="flex items-center gap-2 px-2 text-[0.9375rem] font-bold tracking-tight">
          <BookOpen className="size-5 text-pen" aria-hidden="true" />
          {APP_NAME}
        </Link>
        <Link
          href="/sermons/new"
          className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-pen px-4 text-[0.9375rem] font-semibold text-on-pen hover:bg-pen-strong"
        >
          <Plus className="size-4" aria-hidden="true" />
          New sermon
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-semibold transition-colors",
                  active ? "bg-paper-sunk text-ink" : "text-ink-muted hover:bg-paper-sunk hover:text-ink",
                )}
              >
                <Icon className={cn("size-[1.15rem]", active && "text-pen")} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        {banner}
        <main id="main" className={cn("flex-1", !inNotebook && "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10")}>
          {children}
        </main>
      </div>

      {!inNotebook ? (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 pb-safe backdrop-blur-sm md:hidden"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-4">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-1 text-[0.75rem] font-semibold",
                      active ? "text-pen" : "text-ink-muted",
                    )}
                  >
                    <Icon className="size-[1.35rem]" aria-hidden="true" strokeWidth={active ? 2.25 : 1.9} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
