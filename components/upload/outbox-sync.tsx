"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { flushOutbox } from "@/lib/offline/sync";

/** Sends anything captured offline as soon as the connection returns. */
export function OutboxSync() {
  const router = useRouter();
  useEffect(() => {
    const run = () =>
      void flushOutbox().then((n) => {
        if (n > 0) router.refresh();
      });
    run();
    window.addEventListener("online", run);
    const id = window.setInterval(run, 30_000);
    return () => {
      window.removeEventListener("online", run);
      window.clearInterval(id);
    };
  }, [router]);
  return null;
}
