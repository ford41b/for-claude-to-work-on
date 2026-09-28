import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Start your sermon notebook</h1>
        <p className="mt-2 text-ink-muted">Your notes stay private to you.</p>
      </div>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-pen underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
