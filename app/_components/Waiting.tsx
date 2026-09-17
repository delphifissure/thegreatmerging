import { AutoRefresh } from "./AutoRefresh";
import { Card } from "./Card";
import { RefreshButton } from "./RefreshButton";

/** Two circles drifting toward each other: something is happening, calmly. */
function Pulse() {
  return (
    <div aria-hidden="true" className="relative h-9 w-9 shrink-0 text-accent">
      <span className="anim-drift-left absolute inset-0 rounded-full bg-current opacity-55" />
      <span className="anim-drift-right absolute inset-0 rounded-full bg-current opacity-55" />
    </div>
  );
}

export function Waiting({ title, children, refresh = true }: { title: string; children?: React.ReactNode; refresh?: boolean }) {
  return (
    <Card dashed as="div">
      <div className="flex items-start gap-4">
        <Pulse />
        <div className="min-w-0">
          <p role="status" className="font-display text-xl">
            {title}
          </p>
          {children ? <div className="mt-1.5 text-sm text-muted">{children}</div> : null}
          {refresh ? (
            <div className="mt-3">
              <RefreshButton />
              <AutoRefresh />
              <p className="mt-2 text-xs text-muted">This page checks on its own every 20 seconds.</p>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
