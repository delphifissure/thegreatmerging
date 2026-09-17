export function PageHeader({ title, lede, aside, eyebrow }: { title: string; lede?: string; aside?: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="text-3xl sm:text-[34px]">{title}</h1>
        {lede ? <p className="reading mt-2 max-w-prose text-[17px] leading-relaxed text-muted">{lede}</p> : null}
      </div>
      {aside}
    </header>
  );
}
