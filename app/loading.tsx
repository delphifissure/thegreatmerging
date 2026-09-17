/** Shown while a page's server data loads. Shapes only; no text that could be mistaken for content. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3" aria-hidden="true">
        <div className="h-7 w-48 animate-pulse rounded bg-bar-track" />
        <div className="h-4 w-full max-w-prose animate-pulse rounded bg-bar-track" />
        <div className="h-4 w-2/3 max-w-prose animate-pulse rounded bg-bar-track" />
      </div>
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5" aria-hidden="true">
        <div className="h-5 w-40 animate-pulse rounded bg-bar-track" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-bar-track" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-bar-track" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-bar-track" />
        </div>
      </div>
    </div>
  );
}
