import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-3 px-5">
      <h1 className="text-2xl font-bold">We couldn’t find that</h1>
      <p className="text-ink-muted">It may have been deleted, or the link might be incomplete.</p>
      <Link href="/home" className="font-semibold text-pen underline">
        Go home
      </Link>
    </main>
  );
}
