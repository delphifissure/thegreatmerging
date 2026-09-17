"use client";

/** A switch with a sliding knob. Label it with `aria-labelledby` or `aria-label`. */
export function Toggle({
  checked,
  onChange,
  disabled,
  className = "",
  ...aria
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${checked ? "border-accent bg-accent" : "border-rule bg-paper"} ${className}`}
      {...aria}
    >
      <span aria-hidden="true" className={`absolute top-0.5 h-[22px] w-[22px] rounded-full shadow-sm transition-[left] ${checked ? "left-[22px] bg-accent-ink" : "left-0.5 bg-surface"}`} />
    </button>
  );
}
