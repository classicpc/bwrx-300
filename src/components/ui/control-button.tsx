import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "active" | "danger" | "ghost" | "warning";

export function ControlButton({ className, variant = "default", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  const variants: Record<Variant, string> = {
    default: "border-border bg-secondary text-secondary-foreground shadow-[inset_0_1px_color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:border-primary/60 hover:bg-accent",
    active: "border-primary/70 bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_16%,transparent)] hover:bg-primary/20",
    danger: "border-destructive bg-destructive/15 text-destructive shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_20%,transparent)] hover:bg-destructive/25",
    warning: "border-warning/70 bg-warning/10 text-warning hover:bg-warning/20",
    ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  };
  return <button type="button" className={cn("inline-flex min-h-8 items-center justify-center gap-2 rounded-[1px] border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-40", variants[variant], className)} {...props}>{children}</button>;
}
