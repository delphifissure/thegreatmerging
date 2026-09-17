export function ProgressBar({ value, max, label, detail, showLabel = true }: { value: number; max: number; label: string; detail?: string; showLabel?: boolean }) {
  const clamped = Math.min(value, max);
  const pct = max > 0 ? Math.round((clamped / max) * 100) : 0;
  return (
    <div>
      {showLabel ? (
        <div className="flex justify-between gap-3 text-sm text-muted tabular-nums">
          <span>{label}</span>
          <span aria-hidden="true">{detail ?? `${pct}%`}</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped} of ${max}`}
        className={`h-1.5 w-full overflow-hidden rounded-full bg-tint ${showLabel ? "mt-1.5" : ""}`}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-400 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
