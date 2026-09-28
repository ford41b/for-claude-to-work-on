import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export const fieldClass =
  "w-full rounded-[10px] border border-field bg-paper-raised px-3.5 text-ink placeholder:text-ink-faint " +
  "transition-[border-color,box-shadow] duration-150 focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen-wash " +
  "aria-[invalid=true]:border-danger disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, "h-12 text-base", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "min-h-28 py-3 text-base leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn(fieldClass, "h-12 appearance-none bg-[length:12px] pr-9 text-base", className)} {...rest}>
      {children}
    </select>
  );
}
