import { AutoRefresh } from "./AutoRefresh";
import { Card } from "./Card";
import { RefreshButton } from "./RefreshButton";

export function Waiting({ title, children, refresh = true }: { title: string; children?: React.ReactNode; refresh?: boolean }) {
  return (
    <Card className="border-dashed" as="div">
      <p role="status" className="text-lg font-medium">
        {title}
      </p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
      {refresh ? (
        <div className="mt-3">
          <RefreshButton />
          <AutoRefresh />
          <p className="mt-2 text-xs text-muted">This page checks on its own every 20 seconds.</p>
        </div>
      ) : null}
    </Card>
  );
}
