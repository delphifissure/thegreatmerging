import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const sizes: Record<Size, string> = {
  md: "px-[18px] py-2.5 text-[15px] leading-none",
  sm: "px-3.5 py-2 text-sm leading-none",
};
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border-accent hover:opacity-90",
  secondary: "bg-transparent text-ink border-rule hover:bg-tint",
  danger: "bg-transparent text-ink border-warn hover:bg-warn-bg",
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={props.type ?? "button"} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className = "", href, children }: { variant?: Variant; size?: Size; className?: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
