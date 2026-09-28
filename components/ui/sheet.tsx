"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/**
 * A sheet: slides up from the bottom on phones (thumb reach), centered panel on larger screens.
 * Focus is trapped and restored by Radix; Escape and the scrim close it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:animate-[fade-in_180ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col bg-paper-raised text-ink shadow-[var(--shadow-sheet)] outline-none",
            "inset-x-0 bottom-0 rounded-t-[18px] pb-safe",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:pb-0",
            size === "lg" ? "sm:w-[min(52rem,calc(100vw-3rem))]" : "sm:w-[min(34rem,calc(100vw-3rem))]",
            "data-[state=open]:animate-[sheet-in_240ms_var(--ease-out-quart)] sm:data-[state=open]:animate-[fade-in_160ms_ease-out]",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-rule-strong sm:hidden" aria-hidden="true" />
          <header className="flex items-start gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-bold leading-snug">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-ink-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close
              className="-mr-2 -mt-1 inline-flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-paper-sunk hover:text-ink"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-3">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
