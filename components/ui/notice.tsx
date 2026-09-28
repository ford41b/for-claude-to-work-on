import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/** Inline notice for states the user should know about (never color alone: icon + words). */
export function Notice({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  tone?: "info" | "caution" | "error";
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? CircleAlert : tone === "caution" ? TriangleAlert : Info;
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex gap-3 rounded-[12px] border px-4 py-3.5 text-sm",
        tone === "error" && "border-danger/35 bg-danger-wash",
        tone === "caution" && "border-caution/35 bg-caution-wash",
        tone === "info" && "border-rule bg-paper-sunk",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-danger" : tone === "caution" ? "text-caution" : "text-ink-muted")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={cn("text-ink-muted", Boolean(title) && "mt-0.5")}>{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
