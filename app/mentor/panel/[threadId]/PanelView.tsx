import Link from "next/link";
import { versionByKey, type VersionKind } from "@/lib/biographer/versions";
import { Card, Chip, GeneratedLabel } from "@/app/_components/Card";
import { LinkButton } from "@/app/_components/Button";
import { ReadAcross } from "./ReadAcross";
import { VersionRating } from "./VersionRating";

const KIND_WORDS: Record<VersionKind, string> = { none: "Nothing changed", state: "Your state", move: "Your move", room: "The room", open_line: "One open line", direction: "Your direction" };

export type PanelCard = {
  turnId: string;
  kind: VersionKind;
  label: string;
  change: string;
  replicate: boolean;
  fallback: boolean;
  openingLine: string | null;
  text: string;
  unsureQuestion: string | null;
  drawsOn: string[];
  rating: "like_me" | "bad_day" | "not_like_me" | null;
};
export type PanelReadingView = { question: string; same: string[]; differs: Array<{ observation: string; versions: string[] }> };

/** One situation and the versions that answered it, side by side. Presentation only. */
export function PanelView({ threadId, situation, safety, cards, reading, needed }: { threadId: string; situation: string | null; safety: string | null; cards: PanelCard[]; reading: PanelReadingView | null; needed: number }) {
  const rateable = cards.filter((c) => !c.replicate && !c.fallback);
  const rated = rateable.filter((c) => c.rating).length;
  const labelOf = (key: string) => versionByKey(key)?.label ?? key;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/mentor/panel" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          All panels
        </Link>
        <h1 className="mt-2 text-2xl sm:text-[28px]">Ask all of me</h1>
        <p className="text-sm text-muted">Private to you. Every card is an avatar and a test run: you with one thing changed. Any of them can be wrong.</p>
      </div>

      {situation ? (
        <div className="reading max-w-prose whitespace-pre-line rounded-card bg-tint p-4 text-[16px]">
          <p className="eyebrow mb-1">The situation, in your words</p>
          {situation}
        </div>
      ) : null}

      {safety ? (
        <div className="reading max-w-prose whitespace-pre-line rounded-card border border-warn bg-warn-bg p-4 text-[16px]">
          <p className="eyebrow mb-1">The app</p>
          {safety}
        </div>
      ) : null}

      {cards.length > 0 ? (
        <ol className="grid items-start gap-4 md:grid-cols-2" aria-label="Versions of you">
          {cards.map((c) => (
            <li key={c.turnId} className={`rounded-card border bg-surface p-5 ${c.replicate ? "border-dashed border-rule" : "border-rule shadow-card"}`}>
              <p className="eyebrow mb-1">{KIND_WORDS[c.kind]}</p>
              <h2 className="text-[20px] leading-snug">{c.label}</h2>
              <p className="mt-1 text-sm text-muted">{c.change}</p>
              {c.openingLine ? (
                <figure className="mt-4 border-l-2 border-accent pl-3">
                  <figcaption className="text-xs uppercase tracking-wide text-muted">The first thing I&rsquo;d say</figcaption>
                  <blockquote className="reading mt-1 text-[18px] leading-snug">&ldquo;{c.openingLine}&rdquo;</blockquote>
                </figure>
              ) : null}
              <p className="reading mt-4 whitespace-pre-line text-[16px]">{c.text}</p>
              {c.unsureQuestion ? <p className="mt-2 text-sm text-muted">It wasn&rsquo;t sure about you here, so it has passed a question to your biographer: &ldquo;{c.unsureQuestion}&rdquo;</p> : null}
              {c.drawsOn.length > 0 ? (
                <details className="mt-3 text-sm text-muted">
                  <summary className="cursor-pointer font-medium text-accent">Which of your lines this drew on</summary>
                  <ul className="reading mt-1.5 list-disc space-y-1 pl-5 text-[15px]">
                    {c.drawsOn.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {c.replicate || c.fallback ? null : <VersionRating turnId={c.turnId} rating={c.rating} />}
            </li>
          ))}
        </ol>
      ) : null}

      {reading ? (
        <Card eyebrow="Reading across them">
          {reading.same.length > 0 ? (
            <>
              <h2 className="text-[19px]">What held in every version</h2>
              <ul className="reading mt-1.5 list-disc space-y-1.5 pl-5 text-[16px]">
                {reading.same.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
          {reading.differs.length > 0 ? (
            <>
              <h2 className="mt-5 text-[19px]">What changed with the version</h2>
              <ul className="mt-1.5 space-y-3">
                {reading.differs.map((d) => (
                  <li key={d.observation}>
                    <p className="reading text-[16px]">{d.observation}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {d.versions.map((k) => (
                        <Chip key={k}>{labelOf(k)}</Chip>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="reading mt-4 text-[16px] text-muted">Nothing changed by more than two runs of the same you differ from each other.</p>
          )}
          <p className="reading mt-5 border-t border-rule/70 pt-4 text-[18px] leading-snug">{reading.question}</p>
          <GeneratedLabel className="mt-3" />
        </Card>
      ) : rateable.length >= 2 ? (
        <ReadAcross threadId={threadId} rated={rated} needed={Math.min(needed, rateable.length)} />
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-rule/70 pt-4">
        <LinkButton href="/mentor/panel" variant="secondary">
          Ask about something else
        </LinkButton>
        <LinkButton href="/documents" variant="secondary">
          Your documents
        </LinkButton>
      </div>
    </div>
  );
}
