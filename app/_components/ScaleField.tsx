"use client";

/**
 * One scale, one <fieldset>. Every option is a radio with a visible number and anchor text and an
 * explicit screen-reader label. Scales wider than twelve points render as a number input with a
 * slider instead of a wall of radios.
 */
export type Scale = { min: number; max: number; labels?: string[] };

export function ScaleField({
  legend,
  name,
  scale,
  value,
  onChange,
  disabled,
}: {
  legend: React.ReactNode;
  name: string;
  scale: Scale;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const count = scale.max - scale.min + 1;
  const anchor = (n: number) => scale.labels?.[n - scale.min]?.trim() ?? "";
  const minAnchor = anchor(scale.min);
  const maxAnchor = anchor(scale.max);
  const srLabel = (n: number) => {
    const a = anchor(n);
    if (a) return `${n}, ${a}`;
    if (minAnchor || maxAnchor) return `${n}, between ${scale.min}${minAnchor ? ` (${minAnchor})` : ""} and ${scale.max}${maxAnchor ? ` (${maxAnchor})` : ""}`;
    return String(n);
  };

  if (count > 12) {
    const id = `${name}-number`;
    return (
      <fieldset className="mt-3" disabled={disabled}>
        <legend className="font-medium">{legend}</legend>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label htmlFor={id} className="text-sm">
            Value from {scale.min} to {scale.max}
            {minAnchor ? ` (${scale.min} = ${minAnchor}` : ""}
            {maxAnchor ? `${minAnchor ? "; " : " ("}${scale.max} = ${maxAnchor}` : ""}
            {minAnchor || maxAnchor ? ")" : ""}
          </label>
          <input
            id={id}
            type="number"
            min={scale.min}
            max={scale.max}
            step={1}
            value={value ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && Number.isInteger(n) && n >= scale.min && n <= scale.max) onChange(n);
            }}
            className="w-24"
          />
          <input
            type="range"
            aria-label={`${typeof legend === "string" ? legend : "Scale"} slider, ${scale.min} to ${scale.max}`}
            min={scale.min}
            max={scale.max}
            step={1}
            value={value ?? scale.min}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full max-w-xs"
          />
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="mt-3" disabled={disabled}>
      <legend className="font-medium">{legend}</legend>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {Array.from({ length: count }, (_, i) => scale.min + i).map((n) => {
          const id = `${name}-${n}`;
          const a = anchor(n);
          return (
            <label key={n} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5 has-[:checked]:border-accent has-[:checked]:bg-bar-track">
              <input id={id} type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={srLabel(n)} />
              <span aria-hidden="true" className="w-6 text-right font-mono text-sm">
                {n}
              </span>
              <span aria-hidden="true" className="text-sm">
                {a}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
