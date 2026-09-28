"use client";

import { GraduationCap, House, Library, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Verse } from "@/components/scripture/verse";
import { VERSES } from "@/lib/bible/verses";
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

export interface RailSermon {
  id: string;
  title: string;
  status: "draft" | "finished";
}

export function AppShell({ children, banner, recent = [] }: { children: ReactNode; banner?: ReactNode; recent?: RailSermon[] }) {
  const pathname = usePathname();
  // Inside a notebook the notebook's own navigation takes over on phones.
  const inNotebook = pathname.startsWith("/sermons/");

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_1fr]">
      {/* The rail reads like the inside cover of a notebook: its name, a contents list, the
          sermons it holds, and a verse written at the foot of the page. */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule bg-paper-sunk/40 md:flex">
        <div className="px-6 pb-5 pt-7">
          <Link href="/home" className="group inline-flex items-center gap-2.5 rounded-[4px]">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-pen transition-transform group-hover:scale-125 motion-reduce:transition-none" />
            <span className="reading text-[1.1875rem] font-semibold leading-none tracking-[-0.01em]">{APP_NAME}</span>
          </Link>
        </div>

        <div className="px-4">
          <Link
            href="/sermons/new"
            className="flex h-11 items-center gap-2.5 rounded-[10px] border border-rule-strong bg-paper-raised px-3.5 text-[0.9375rem] font-semibold text-ink shadow-[0_1px_0_rgb(0_0_0/0.05)] transition-colors hover:border-pen hover:text-pen"
          >
            <Plus className="size-4 text-pen" aria-hidden="true" />
            New sermon
          </Link>
        </div>

        <nav aria-label="Main" className="mt-6 px-4">
          <ul className="flex flex-col border-t border-rule">
            {NAV.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href} className="border-b border-rule">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-[6px] px-2 text-[0.9375rem] font-semibold transition-colors",
                      active ? "text-ink" : "text-ink-muted hover:bg-paper-sunk hover:text-ink",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-pen" : "bg-transparent")}
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {recent.length ? (
          <section aria-labelledby="rail-recent" className="mt-8 min-h-0 flex-1 overflow-y-auto px-4">
            <h2 id="rail-recent" className="label-caps px-2">
              Recent sermons
            </h2>
            <ul className="mt-2 flex flex-col">
              {recent.map((s) => {
                const active = pathname.startsWith(`/sermons/${s.id}`);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/sermons/${s.id}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "reading block rounded-[6px] px-2 py-1.5 text-[0.9375rem] leading-snug transition-colors",
                        active ? "bg-paper-sunk text-ink" : "text-ink-muted hover:bg-paper-sunk hover:text-ink",
                      )}
                    >
                      <span className="line-clamp-2">{s.title}</span>
                      {s.status === "draft" ? <span className="mt-0.5 block font-sans text-2xs font-semibold text-ink-faint">In progress</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <div className="flex-1" />
        )}

        <div className="px-6 pb-6 pt-6">
          <Verse verse={VERSES.lamp} size="sm" />
        </div>
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
