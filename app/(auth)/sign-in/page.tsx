import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-ink-muted">Sign in to your sermon notebooks.</p>
      </div>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
      <p className="text-sm text-ink-muted">
        New here?{" "}
        <Link href="/sign-up" className="font-semibold text-pen underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
