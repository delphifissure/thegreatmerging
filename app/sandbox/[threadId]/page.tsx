import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import { readSandbox } from "@/lib/sandbox/read";
import { briefsReady, nextSide, sandboxIsOver, SANDBOX_HARD_LIMIT } from "@/lib/sandbox/scenario";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { LinkButton } from "@/app/_components/Button";
import { AfterControls, BriefBox, SandboxRunner, WriteBriefs } from "./Controls";
import { TurnBubble } from "./TurnBubble";

export const metadata = { title: "Sandbox" };


export default async function SandboxPage({ params }: { params: Promise<{ threadId: string }> }) {
  if (!FEATURES.biographer) notFound();
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();
  const user = await requireAppUser();
  const box = await readSandbox(threadId, user.id);
  if (!box) notFound();
  const { scenario: s, turns, briefs } = box;
  const ready = briefsReady(briefs);
  const started = turns.length > 0;
  const over = sandboxIsOver(turns, box.maxTurns);
  const endedByThem = turns[turns.length - 1]?.ends === true;
  const safety = screenText([s.a.notes, s.b.notes, s.shared, s.situation].join("\n"));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/sandbox" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          Sandbox
        </Link>
        <h1 className="mt-2 text-2xl sm:text-[28px]">
          {s.a.name} and {s.b.name}
        </h1>
        <p className="reading mt-1 max-w-prose text-[16px] text-muted">{s.situation}</p>
        {s.aOnly || s.bOnly ? (
          <dl className="mt-2 max-w-prose space-y-1 text-sm text-muted">
            {(["a", "b"] as const).map((side) =>
              (side === "a" ? s.aOnly : s.bOnly) ? (
                <div key={side}>
                  <dt className="inline font-medium text-ink">Only {s[side].name} knows or thinks: </dt>
                  <dd className="inline">{side === "a" ? s.aOnly : s.bOnly}</dd>
                </div>
              ) : null,
            )}
          </dl>
        ) : null}
      </div>

      {safety ? (
        <div role="note" className="reading max-w-prose whitespace-pre-line rounded-card border border-warn bg-warn-bg p-4 text-[15px]">
          <p className="mb-1 font-sans text-sm font-medium">This page is for made-up people. If any of it is about you:</p>
          {SAFETY_TEXT_MESSAGES[safety]}
        </div>
      ) : null}

      {ready ? (
        <details className="rounded-card border border-rule bg-surface p-5" open={!started}>
          <summary className="cursor-pointer font-medium text-accent">What each of them is told</summary>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Each brief is written to that person, from their own notes, the life they share, what both can see of the situation and their own private side of it. It is never made from the other&rsquo;s notes or the other&rsquo;s side, and anything its person couldn&rsquo;t know is left out, not written as &ldquo;you don&rsquo;t know that&rdquo;. Beyond it, each is told only this (<code>prompts/sandbox_avatar.v4.md</code>): you are this person and this is happening now; feel it before you speak, and react in proportion; say what you would really say, however unfair; you are not a therapist; what you have been hiding stays hidden unless it comes out badly; most of these end unfinished, not in a hug; keep turns short. They can say whatever they like to each other. The one stop is physical violence, threats of it, or self-harm.
            {started ? "" : " You can change either brief until someone speaks."}
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <BriefBox key={`${side}-${briefs[side].length}`} threadId={box.threadId} side={side} name={s[side].name} brief={briefs[side]} locked={started} />
            ))}
          </div>
          {started ? null : (
            <div className="mt-3">
              <WriteBriefs threadId={box.threadId} again />
            </div>
          )}
        </details>
      ) : (
        <WriteBriefs threadId={box.threadId} />
      )}

      {turns.length > 0 ? (
        <ol className="space-y-2.5" aria-label="The conversation">
          {turns.map((t, i) => (
            <TurnBubble key={i} turn={t} name={s[t.side].name} otherName={s[t.side === "a" ? "b" : "a"].name} landed={turns[i + 1]?.impact ?? null} />
          ))}
        </ol>
      ) : null}

      {over ? (
        <div className="space-y-3 border-t border-rule/70 pt-4">
          <p className="reading text-[17px]">{endedByThem ? `${s[turns[turns.length - 1].side].name} ended it there, after ${turns.length} turns.` : `They were still going after ${turns.length} turns, which is where this pauses by itself.`}</p>
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={`/sandbox?from=${box.threadId}`} variant="secondary">
              New sandbox from this one
            </LinkButton>
          </div>
          <AfterControls threadId={box.threadId} canExtend={!endedByThem && box.maxTurns < SANDBOX_HARD_LIMIT} />
        </div>
      ) : (
        <>
          {ready ? <SandboxRunner key={box.maxTurns} threadId={box.threadId} turns={turns.length} names={{ a: s.a.name, b: s.b.name }} next={nextSide(s, turns)} /> : null}
          <AfterControls threadId={box.threadId} canExtend={false} />
        </>
      )}
    </div>
  );
}
