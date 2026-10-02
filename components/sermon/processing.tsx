"use client";

import { Check, CircleAlert, Loader, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import type { ProcessingStatus } from "@/lib/sermons/status";

const ProcessingContext = createContext<ProcessingStatus | null>(null);

/**
 * Polls the real job-backed status while anything is processing and refreshes the page data
 * whenever something visible changed, so results appear progressively.
 */
export function ProcessingProvider({ sermonId, initial, children }: { sermonId: string; initial: ProcessingStatus; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState({ initial, status: initial });
  // New server data (after router.refresh) replaces the polled status.
  if (state.initial !== initial) setState({ initial, status: initial });
  const status = state.status;
  const version = useRef(initial.dataVersion);
  useEffect(() => {
    version.current = status.dataVersion;
  }, [status.dataVersion]);

  useEffect(() => {
    if (status.overall !== "processing") return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await api<ProcessingStatus>(`/api/sermons/${sermonId}/status`);
        if (stopped) return;
        setState((s) => ({ ...s, status: next }));
        if (next.dataVersion !== version.current) {
          version.current = next.dataVersion;
          router.refresh();
        }
      } catch {
        // Offline or transient: keep polling.
      }
    };
    const id = window.setInterval(tick, 3000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [sermonId, status.overall, router]);

  return <ProcessingContext.Provider value={status}>{children}</ProcessingContext.Provider>;
}

export function useProcessing() {
  return useContext(ProcessingContext);
}

/** Compact line for the header: "Processing · Reading photos". */
export function ProcessingPill() {
  const status = useProcessing();
  if (!status || status.overall === "idle") return null;
  const running = status.stages.find((s) => s.state === "running") ?? status.stages.find((s) => s.state === "pending");
  if (status.overall === "processing") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        <Loader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {running?.label ?? "Processing"}
      </span>
    );
  }
  if (status.overall === "attention") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-caution">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        Needs attention
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
      <Check className="size-3.5 text-ok" aria-hidden="true" />
      Sermon Pack ready{status.packStale ? " · updating soon" : ""}
    </span>
  );
}

/** Stage list: every line is a real job; failed steps say why and what to do next. */
export function ProcessingStages({ sermonId, className }: { sermonId: string; className?: string }) {
  const status = useProcessing();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  if (!status || !status.stages.length) return null;
  if (status.overall !== "processing" && status.overall !== "attention") return null;

  const retryPack = async () => {
    setRetrying(true);
    try {
      await api(`/api/sermons/${sermonId}/rebuild`, { method: "POST" });
      router.refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section aria-labelledby="processing-title" className={cn("rounded-[14px] border border-rule bg-paper-raised p-4", className)}>
      <h2 id="processing-title" className="label-caps">
        {status.overall === "processing" ? "Working on your sermon" : status.overall === "attention" ? "Some steps need attention" : "Processing"}
      </h2>
      <ol className="mt-3 flex flex-col gap-2.5">
        {status.stages.map((s) => (
          <li key={s.key} className="flex gap-3">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
              {s.state === "done" ? (
                <Check className="size-4 text-ok" />
              ) : s.state === "running" ? (
                <Loader className="size-4 animate-spin text-pen motion-reduce:animate-none" />
              ) : s.state === "failed" ? (
                <CircleAlert className="size-4 text-caution" />
              ) : (
                <span className="size-2 rounded-full border border-rule-strong" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", s.state === "pending" ? "text-ink-muted" : "text-ink")}>
                {s.label}
                <span className="sr-only">
                  {" "}
                  — {s.state === "done" ? "done" : s.state === "running" ? "in progress" : s.state === "failed" ? "needs attention" : "waiting"}
                </span>
              </p>
              {s.state === "failed" && s.error ? (
                <>
                  <p className="text-sm text-ink-muted">{s.error.message}</p>
                  <details className="mt-1 text-xs text-ink-muted">
                    <summary className="cursor-pointer font-semibold hover:text-ink">Technical details</summary>
                    <p className="mt-1 break-words font-mono">
                      {s.error.code}
                      {s.error.detail ? ` — ${s.error.detail}` : ""}
                    </p>
                  </details>
                </>
              ) : s.detail ? (
                <p className="text-sm text-ink-muted">{s.detail}</p>
              ) : null}
              {s.state === "failed" && s.key === "pack" ? (
                <Button size="sm" variant="secondary" className="mt-2" loading={retrying} onClick={retryPack} icon={<RotateCw className="size-4" aria-hidden="true" />}>
                  Try again
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
