import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold select-none whitespace-nowrap " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out " +
  "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary: "bg-pen text-on-pen hover:bg-pen-strong active:bg-pen-strong shadow-[0_1px_0_rgb(0_0_0/0.08)]",
  secondary: "bg-paper-raised text-ink border border-rule-strong hover:border-field hover:bg-paper-sunk",
  quiet: "text-ink-muted hover:text-ink hover:bg-paper-sunk",
  danger: "bg-paper-raised text-danger border border-rule-strong hover:bg-danger-wash hover:border-danger",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[0.9375rem]",
  lg: "h-14 px-5 text-base",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-[10px] text-ink-muted transition-colors duration-150",
        "hover:bg-paper-sunk hover:text-ink disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
