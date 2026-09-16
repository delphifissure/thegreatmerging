export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span aria-hidden="true">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={`${Math.min(value, max)} of ${max}`}
        className="mt-1 h-2 w-full overflow-hidden rounded bg-bar-track"
      >
        <div className="h-full bg-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
