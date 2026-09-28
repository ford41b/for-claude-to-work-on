import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/** A notebook section: a printed field-name heading, generous space above, hairline between. */
export function NotebookSection({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("border-t border-rule pt-6 first:border-t-0 first:pt-0", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id={id} className="label-caps">
          {title}
        </h2>
        {action ? (
          <Link href={action.href} className="text-sm font-semibold text-pen hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
