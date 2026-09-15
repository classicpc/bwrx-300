import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "active" | "danger" | "ghost" | "warning";

export function ControlButton({ className, variant = "default", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  const variants: Record<Variant, string> = {
    default: "border-border bg-secondary text-secondary-foreground hover:border-primary/60 hover:bg-accent",
    active: "border-primary/60 bg-primary/15 text-primary hover:bg-primary/20",
    danger: "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/25",
    warning: "border-warning/60 bg-warning/10 text-warning hover:bg-warning/20",
    ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  };
  return <button type="button" className={cn("inline-flex min-h-8 items-center justify-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-normal transition-colors disabled:cursor-not-allowed disabled:opacity-40", variants[variant], className)} {...props}>{children}</button>;
}
