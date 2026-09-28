"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "sign-in" | "sign-up";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [method, setMethod] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    try {
      if (method === "link") {
        const { error: err } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: mode === "sign-up",
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
            data: mode === "sign-up" && name ? { display_name: name } : undefined,
          },
        });
        if (err) throw err;
        setSent(true);
        return;
      }
      if (mode === "sign-up") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
            data: name ? { display_name: name } : undefined,
          },
        });
        if (err) throw err;
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(
        /invalid login credentials/i.test(message)
          ? "That email and password don't match an account."
          : /already registered/i.test(message)
            ? "An account with that email already exists. Sign in instead."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Notice title="Check your email">
        We sent a link to <strong className="text-ink">{email}</strong>. Open it on this device to continue. It expires in one hour.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div role="radiogroup" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 rounded-[12px] bg-paper-sunk p-1">
        {(["password", "link"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={
              method === m
                ? "h-10 rounded-[9px] bg-paper-raised text-sm font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                : "h-10 rounded-[9px] text-sm font-semibold text-ink-muted hover:text-ink"
            }
          >
            {m === "password" ? "Password" : "Email me a link"}
          </button>
        ))}
      </div>

      {mode === "sign-up" ? (
        <Field label="Your name" hint="Optional — used to greet you." htmlFor="name">
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
      ) : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {method === "password" ? (
        <Field label="Password" htmlFor="password" hint={mode === "sign-up" ? "At least 8 characters." : undefined}>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!email || (method === "password" && password.length < 8)}>
        {method === "link" ? "Send link" : mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
