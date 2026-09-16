import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "danger";

const base =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast border-accent hover:opacity-90",
  secondary: "bg-surface text-foreground border-border hover:bg-bar-track",
  danger: "bg-surface text-foreground border-warn-border hover:bg-warn-bg",
};

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={props.type ?? "button"} className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", href, children }: { variant?: Variant; className?: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
