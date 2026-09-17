/** Small labelled-input helpers for server-rendered forms. */
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "good" }) {
  const cls = tone === "warn" ? "border-warn bg-warn-bg" : tone === "good" ? "border-accent/40 bg-tint" : "border-rule bg-surface";
  return (
    <p role={tone === "warn" ? "alert" : "status"} className={`rounded-control border px-3.5 py-2.5 text-sm ${cls}`}>
      {children}
    </p>
  );
}
