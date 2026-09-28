import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-bold">That link didn’t work</h1>
      <p className="text-ink-muted">Sign-in links expire after an hour and can be used once. Request a new one and open it on this device.</p>
      <Link href="/sign-in" className="font-semibold text-pen underline">
        Back to sign in
      </Link>
    </main>
  );
}
