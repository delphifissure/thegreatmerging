"use client";

/**
 * One scale, one <fieldset>. Up to twelve points render as a single row of boxes, the number in
 * each box, the end anchors under the row, and the chosen point's own anchor spelled out beneath.
 * Every option is a real radio that covers its box, so it takes the click and the keyboard.
 * Wider scales render as a number input with a slider.
 */
export type Scale = { min: number; max: number; labels?: string[] };

export function ScaleField({
  legend,
  name,
  scale,
  value,
  onChange,
  disabled,
  settle = true,
}: {
  legend: React.ReactNode;
  name: string;
  scale: Scale;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Bounce the chosen box on selection. */
  settle?: boolean;
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
            className="w-full max-w-xs accent-accent"
          />
        </div>
      </fieldset>
    );
  }

  const chosenAnchor = value !== null ? anchor(value) : "";
  const cols = count <= 7 ? count : Math.ceil(count / 2);
  return (
    <fieldset className="mt-3" disabled={disabled}>
      <legend className="font-medium">{legend}</legend>
      <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: count }, (_, i) => scale.min + i).map((n) => {
          const id = `${name}-${n}`;
          const chosen = value === n;
          return (
            <label
              key={n}
              htmlFor={id}
              className={`relative grid h-13 cursor-pointer place-items-center rounded-control border font-sans text-[17px] font-medium tabular-nums transition-colors ${
                chosen ? `border-accent bg-accent text-accent-ink ${settle ? "anim-settle" : ""}` : "border-rule bg-paper hover:border-accent/60"
              } has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-2`}
            >
              <input id={id} type="radio" name={name} value={n} checked={chosen} onChange={() => onChange(n)} aria-label={srLabel(n)} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
              <span aria-hidden="true">{n}</span>
            </label>
          );
        })}
      </div>
      {minAnchor || maxAnchor ? (
        <div aria-hidden="true" className="mt-2 flex justify-between gap-4 text-sm text-muted">
          <span>{minAnchor}</span>
          <span className="text-right">{maxAnchor}</span>
        </div>
      ) : null}
      <p aria-hidden="true" className="reading mt-2 min-h-6 text-[15px] text-ink">
        {chosenAnchor && chosenAnchor !== minAnchor && chosenAnchor !== maxAnchor ? `${value}: ${chosenAnchor}` : " "}
      </p>
    </fieldset>
  );
}
