import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import { MOVE_DID } from "@/lib/replay/moves";
import { readSandbox } from "@/lib/sandbox/read";
import { briefFor, sandboxIsOver, SANDBOX_EXTEND_BY, SANDBOX_HARD_LIMIT } from "@/lib/sandbox/scenario";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { LinkButton } from "@/app/_components/Button";
import { AfterControls, SandboxRunner } from "./Controls";

export const metadata = { title: "Sandbox" };

const MEANT: Record<string, string> = { "-2": "to push back hard", "-1": "coolly", "0": "neutrally", "1": "warmly", "2": "to reach toward them" };
const LANDED: Record<string, string> = { "-2": "it stung", "-1": "it grated", "0": "neither way", "1": "it eased things", "2": "it warmed them" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default async function SandboxPage({ params }: { params: Promise<{ threadId: string }> }) {
  if (!FEATURES.biographer) notFound();
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();
  const user = await requireAppUser();
  const box = await readSandbox(threadId, user.id);
  if (!box) notFound();
  const { scenario: s, turns } = box;
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
      </div>

      {safety ? (
        <div role="note" className="reading max-w-prose whitespace-pre-line rounded-card border border-warn bg-warn-bg p-4 text-[15px]">
          <p className="mb-1 font-sans text-sm font-medium">This page is for made-up people. If any of it is about you:</p>
          {SAFETY_TEXT_MESSAGES[safety]}
        </div>
      ) : null}

      <details className="rounded-card border border-rule bg-surface p-5">
        <summary className="cursor-pointer font-medium text-accent">What each avatar was told</summary>
        <p className="mt-2 text-sm text-muted">Each is also given the house rules in <code>prompts/sandbox_avatar.v1.md</code>: be this person now, do not make it easier than it would be, no insults or labels, short turns. Neither has read the other&rsquo;s notes.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(["a", "b"] as const).map((side) => (
            <div key={side}>
              <p className="eyebrow mb-1">{s[side].name}</p>
              <pre className="reading max-h-96 overflow-auto whitespace-pre-wrap rounded-control border border-rule bg-paper p-3 text-[14px] leading-relaxed">{briefFor(s, side)}</pre>
            </div>
          ))}
        </div>
      </details>

      {turns.length > 0 ? (
        <ol className="space-y-2.5" aria-label="The conversation">
          {turns.map((t, i) => {
            const landed = turns[i + 1]?.impact ?? null;
            return (
              <li key={i} className={`max-w-prose rounded-card p-4 ${t.side === "a" ? "mr-6 border border-rule bg-surface" : "ml-6 bg-tint"}`}>
                <p className="eyebrow mb-1">
                  {s[t.side].name}
                  {t.move ? ` · ${MOVE_DID[t.move]}` : ""}
                  {t.secondary && t.secondary !== t.move ? `, and ${MOVE_DID[t.secondary]}` : ""}
                  {t.given ? " · the line you gave them" : ""}
                </p>
                {t.says ? <p className="reading whitespace-pre-line text-[17px]">&ldquo;{t.says}&rdquo;</p> : null}
                {t.does ? <p className="reading text-[16px] italic text-muted">{t.does}</p> : null}
                {t.intent != null || landed != null ? (
                  <p className="mt-2 text-sm text-muted">
                    {t.intent != null ? `Meant ${MEANT[String(t.intent)]} (${signed(t.intent)})` : ""}
                    {t.intent != null && landed != null ? " · " : ""}
                    {landed != null ? `on ${s[t.side === "a" ? "b" : "a"].name} ${LANDED[String(landed)]} (${signed(landed)})` : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {over ? (
        <div className="space-y-3 border-t border-rule/70 pt-4">
          <p className="reading text-[17px]">{endedByThem ? `${s[turns[turns.length - 1].side].name} ended it there.` : "They have used the turns you gave them."}</p>
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={`/sandbox?from=${box.threadId}`} variant="secondary">
              New sandbox from this one
            </LinkButton>
          </div>
          <AfterControls threadId={box.threadId} canExtend={!endedByThem && box.maxTurns + SANDBOX_EXTEND_BY <= SANDBOX_HARD_LIMIT} />
        </div>
      ) : (
        <>
          <SandboxRunner key={box.maxTurns} threadId={box.threadId} turns={turns.length} maxTurns={box.maxTurns} />
          <AfterControls threadId={box.threadId} canExtend={false} />
        </>
      )}
    </div>
  );
}
