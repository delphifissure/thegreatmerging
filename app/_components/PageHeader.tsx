export function PageHeader({ title, lede, aside }: { title: string; lede?: string; aside?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {lede ? <p className="mt-1 max-w-prose text-muted">{lede}</p> : null}
      </div>
      {aside}
    </header>
  );
}
