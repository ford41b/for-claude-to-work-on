"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";

type Tone = "neutral" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<{ show: (message: string, opts?: { tone?: Tone; action?: ToastItem["action"]; durationMs?: number }) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, opts: { tone?: Tone; action?: ToastItem["action"]; durationMs?: number } = {}) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-2), { id, message, tone: opts.tone ?? "neutral", action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.durationMs ?? (opts.tone === "error" ? 8000 : 4500));
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[12px] border px-4 py-3 text-sm shadow-[var(--shadow-float)]",
              "animate-[toast-in_200ms_var(--ease-out-quart)]",
              t.tone === "error" ? "border-danger/40 bg-danger-wash text-ink" : "border-rule bg-paper-raised text-ink",
            )}
          >
            <p className="flex-1">{t.message}</p>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="font-semibold text-pen hover:underline"
              >
                {t.action.label}
              </button>
            ) : null}
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 rounded p-1 text-ink-muted hover:text-ink">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
