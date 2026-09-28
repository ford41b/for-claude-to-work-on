"use client";

import { Download, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import type { IntegrationStatus } from "@/lib/integrations/status";

type Theme = "system" | "light" | "dark";
type TextSize = "small" | "default" | "large" | "xlarge";

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-[12px] bg-paper-sunk p-1">
        {options.map((o) => (
          <label key={o.value} className={cn("cursor-pointer rounded-[9px] px-3 py-2 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pen", value === o.value ? "bg-paper-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-ink-muted")}>
            <input type="radio" name={label} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const STATE_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  PREVIEW: "Preview",
  UNAVAILABLE: "Not available",
  DEPRECATED: "Deprecated",
  DISABLED: "Not configured",
  ERROR: "Error",
};

export function ProfileSettings({ displayName, theme: initialTheme, textSize: initialSize, integrations }: { displayName: string; theme: Theme; textSize: TextSize; integrations: IntegrationStatus[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(displayName);
  const [theme, setTheme] = useState(initialTheme);
  const [size, setSize] = useState(initialSize);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveSetting = async (body: Record<string, unknown>) => {
    try {
      await api("/api/settings", { method: "PATCH", body });
      if ("theme" in body) {
        const t = body.theme as Theme;
        if (t === "system") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", t);
      }
      if ("textSize" in body) {
        const s = body.textSize as TextSize;
        if (s === "default") document.documentElement.removeAttribute("data-text-size");
        else document.documentElement.setAttribute("data-text-size", s);
      }
      router.refresh();
    } catch {
      toast.show("Couldn't save that setting.", { tone: "error" });
    }
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    await saveSetting({ displayName: name });
    toast.show("Saved.");
  };

  const removeAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/account", { method: "DELETE", body: { confirmation: confirm } });
      router.replace("/sign-in");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't delete the account.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-10 pb-10">
      <form onSubmit={saveName} className="flex flex-col gap-3">
        <Field label="Your name" htmlFor="p-name" hint="Used to greet you on the home screen.">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        </Field>
        <Button type="submit" className="self-start">
          Save name
        </Button>
      </form>

      <section aria-labelledby="display-title" className="flex flex-col gap-5">
        <h2 id="display-title" className="label-caps">
          Display
        </h2>
        <Segmented
          label="Appearance"
          value={theme}
          options={[
            { value: "system", label: "Match device" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(v) => {
            setTheme(v);
            void saveSetting({ theme: v });
          }}
        />
        <Segmented
          label="Text size"
          value={size}
          options={[
            { value: "small", label: "Small" },
            { value: "default", label: "Default" },
            { value: "large", label: "Large" },
            { value: "xlarge", label: "Largest" },
          ]}
          onChange={(v) => {
            setSize(v);
            void saveSetting({ textSize: v });
          }}
        />
        <p className="text-sm text-ink-muted">Sunday Mode always uses a dim screen so it doesn’t distract people around you.</p>
      </section>

      <section aria-labelledby="privacy-title" className="flex flex-col gap-3">
        <h2 id="privacy-title" className="label-caps">
          Privacy & AI
        </h2>
        <div className="reading flex flex-col gap-2 leading-relaxed">
          <p>Your notebooks are private to your account. Nothing is shared or published.</p>
          <p>
            When you link a video, upload a recording or photo, finish a sermon, ask a question, or create a study, the relevant content is sent
            to the AI service listed below to do that task. Your content is not used to train models by this app, and under the provider’s
            paid-API terms it is not used to improve their products.
          </p>
          <p>Your notes are never rewritten by AI. Generated material is always labeled, and every summary links back to its sources.</p>
        </div>
      </section>

      <section aria-labelledby="integrations-title" className="flex flex-col gap-3">
        <h2 id="integrations-title" className="label-caps">
          Connected services
        </h2>
        <ul className="flex flex-col divide-y divide-rule rounded-[12px] border border-rule">
          {integrations.map((i) => (
            <li key={i.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">{i.name}</p>
                <span className={cn("shrink-0 text-xs font-semibold", i.state === "AVAILABLE" ? "text-ok" : i.state === "PREVIEW" ? "text-pen" : "text-ink-muted")}>
                  {STATE_LABEL[i.state]}
                </span>
              </div>
              <p className="text-sm text-ink-muted">{i.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="data-title" className="flex flex-col gap-3">
        <h2 id="data-title" className="label-caps">
          Your data
        </h2>
        <div className="flex flex-wrap gap-2">
          <a href="/api/account/export" className={buttonClass("secondary", "md")}>
            <Download className="size-4" aria-hidden="true" />
            Export everything
          </a>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className={buttonClass("secondary", "md")}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
          <Button variant="danger" onClick={() => setDeleting(true)} icon={<Trash2 className="size-4" aria-hidden="true" />}>
            Delete account
          </Button>
        </div>
      </section>

      <Sheet open={deleting} onOpenChange={setDeleting} title="Delete your account?">
        <div className="flex flex-col gap-4">
          <p>This permanently deletes every sermon notebook, note, photo, recording, and generated study. Consider exporting first.</p>
          <Field label='Type "DELETE" to confirm' htmlFor="confirm-delete">
            <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
            <Button variant="danger" disabled={confirm !== "DELETE"} loading={busy} onClick={removeAccount}>
              Delete everything
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
