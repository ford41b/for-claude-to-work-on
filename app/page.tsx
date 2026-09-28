import { BookOpen, Image as ImageIcon, PenLine, Play } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config/app";

function Chip({ icon, children, you }: { icon: React.ReactNode; children: React.ReactNode; you?: boolean }) {
  return (
    <span
      className={
        you
          ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-pen/40 bg-pen-wash px-2.5 text-xs font-semibold text-pen"
          : "inline-flex h-8 items-center gap-1.5 rounded-full border border-rule-strong bg-paper-raised px-2.5 text-xs font-semibold text-ink"
      }
    >
      {icon}
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <span className="inline-flex items-center gap-2 font-bold tracking-tight">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-pen" />
          {APP_NAME}
        </span>
        <Link href="/sign-in" className="text-sm font-semibold text-ink-muted hover:text-ink">
          Sign in
        </Link>
      </header>
      <main id="main" className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-5 py-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <h1 className="reading text-[2.4rem] font-semibold leading-[1.1] sm:text-[3.25rem]">Remember the sermon — and where every point came from.</h1>
          <p className="reading mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
            Take notes and photos during the service. Afterwards, your notes, the slides, and the recording become one study notebook: the big
            idea, the main points, the Scripture, and a timeline you can tap to hear the moment again.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonClass("primary", "lg")}>
              Start a notebook
            </Link>
            <Link href="/sign-in" className={buttonClass("secondary", "lg")}>
              I have an account
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-muted">Private by default. Your own words are never rewritten.</p>
        </div>

        <figure className="rounded-[18px] border border-rule-strong bg-paper-raised p-5 sm:p-7">
          <figcaption className="label-caps">Example notebook entry</figcaption>
          <p className="mt-4 label-caps">Main idea</p>
          <p className="reading mt-1 text-xl font-semibold leading-snug">Waiting can be an active expression of trust.</p>
          <p className="reading mt-2 leading-relaxed text-ink-muted">The sermon presents seasons of waiting as places where trust is practiced, not paused.</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip icon={<Play className="size-3" aria-hidden="true" strokeWidth={2.6} />}>
              <span className="font-mono tabular">~18:42–20:10</span>
            </Chip>
            <Chip icon={<ImageIcon className="size-3" aria-hidden="true" />}>Photo 3</Chip>
            <Chip you icon={<PenLine className="size-3" aria-hidden="true" />}>
              Your note · 12:43
            </Chip>
          </div>
          <div className="mt-6 border-t border-rule pt-4">
            <p className="flex items-center gap-2 text-sm">
              <BookOpen className="size-4 text-ink-muted" aria-hidden="true" />
              <span className="reading font-semibold">Romans 8:24–25</span>
              <span className="text-ink-muted">· main text</span>
            </p>
          </div>
          <p className="mt-5 text-xs text-ink-muted">Illustration of the notebook layout; the sermon shown is an example.</p>
        </figure>
      </main>
    </div>
  );
}
