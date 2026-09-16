/** Small labelled-input helpers for server-rendered forms. */
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const cls = tone === "warn" ? "border-warn-border bg-warn-bg" : "border-border bg-surface";
  return (
    <p role={tone === "warn" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}
