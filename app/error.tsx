"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-3 px-5">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-ink-muted">Your notes are safe. Try again, and if it keeps happening, reload the page.</p>
      <div>
        <button type="button" onClick={reset} className="h-11 rounded-[10px] bg-pen px-4 font-semibold text-on-pen">
          Try again
        </button>
      </div>
    </main>
  );
}
