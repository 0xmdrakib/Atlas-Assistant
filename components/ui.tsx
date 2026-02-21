import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-soft bg-surface shadow-soft ring-1 ring-subtle",
        className
      )}
      {...props}
    />
  );
}

export function Pill({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-soft bg-glass px-2.5 py-0.5 text-xs text-muted",
        className
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition focus-ring disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-transparent";
  const styles =
    variant === "ghost"
      ? "border border-soft bg-transparent hover-subtle"
      : variant === "danger"
      ? "bg-[hsl(var(--danger))] text-black hover:opacity-90"
      : "bg-[hsl(var(--accent))] text-black hover:opacity-90";
  return <button className={cn(base, styles, className)} {...props} />;
}

export function A({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} target="_blank" className={cn("underline underline-offset-4 hover:opacity-80", className)}>
      {children}
    </Link>
  );
}

type SegOption<T extends string | number> = { value: T; label: string };

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<SegOption<T>>;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-soft bg-glass">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-2 text-sm transition focus-ring",
              active
                ? "bg-[hsl(var(--accent))] text-black"
                : "text-muted hover-subtle"
            )}
            type="button"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
