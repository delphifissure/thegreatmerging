import Link from "next/link";
import { notFound } from "next/navigation";
import * as data from "@/lib/data";
import { loadColorModule } from "@/lib/color/config";
import { currentItem, initMachine, progressLabel, type MachineState } from "@/lib/color/machine";
import { DomainSchema } from "@/instruments/schema";
import { requirePartner } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { LinkButton } from "@/app/_components/Button";
import { Waiting } from "@/app/_components/Waiting";
import { buildInitContext, flaggedDomainsFor } from "@/app/color/_lib/context";
import { ChatForm } from "./ChatForm";
import { RetryProbes } from "./RetryProbes";

export default async function ColorDomainPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: raw } = await params;
  const parsedDomain = DomainSchema.safeParse(raw);
  if (!parsedDomain.success) notFound();
  const domain = parsedDomain.data;
  const user = await requirePartner();
  const run = await data.getLatestRun(user.couple.id);
  if (!run || run.status !== "complete") notFound();
  const flagged = await flaggedDomainsFor(user.id, user.couple.id);
  if (!flagged.some((d) => d.domain === domain)) notFound();

  const config = loadColorModule(domain);
  const ctx = await buildInitContext({ userId: user.id, coupleId: user.couple.id, side: user.side, domain });
  const session = await data.getOrCreateColorSession({ userId: user.id, coupleId: user.couple.id, domain, runId: run.id, initialState: () => initMachine(config, ctx) });
  const state = session.state as MachineState;
  const item = currentItem(state);
  const transcript = (session.transcript as data.TranscriptTurn[]) ?? [];
  const label = progressLabel(state, config);
  const groupTitle = item?.group && config.groups ? config.groups[item.group] : null;
  const waitingForProbes = state.state === "consistency" && !state.probes_loaded && !item;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/color" className="text-sm underline">
          All flagged domains
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{config.title}</h1>
        <p className="text-sm text-muted" role="status">
          {label}
          {groupTitle ? ` · ${groupTitle}` : ""}
        </p>
      </div>

      {transcript.length === 0 ? <p className="reading max-w-prose text-[17px] text-muted">{config.common.transitions.enter}</p> : null}

      {transcript.length > 0 ? (
        <ol className="space-y-2.5" aria-label="Earlier questions and your answers">
          {transcript.map((t, i) => (
            <li key={i} className={`reading max-w-prose rounded-card p-4 text-[16px] ${t.role === "user" ? "ml-6 bg-tint" : "mr-6 border border-rule bg-surface"}`}>
              <p className="eyebrow mb-1">{t.role === "user" ? "You wrote" : "Question"}</p>
              {t.content}
            </li>
          ))}
        </ol>
      ) : null}

      {state.state === "complete" ? (
        <Card>
          <p>{config.common.transitions.complete}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <LinkButton href="/color">Next domain</LinkButton>
            <LinkButton href="/brief" variant="secondary">
              Brief
            </LinkButton>
          </div>
        </Card>
      ) : waitingForProbes ? (
        <Waiting title="Checking for follow-ups…">
          {config.common.transitions.consistency}
          <RetryProbes sessionId={session.id} />
        </Waiting>
      ) : item ? (
        <>
          {item.kind === "probe" && transcript.every((t) => t.step !== "consistency" || t.role !== "user") ? <p className="text-sm text-muted">{config.common.transitions.consistency}</p> : null}
          <ChatForm
            key={item.id}
            sessionId={session.id}
            item={{ id: item.id, kind: item.kind, step: item.step, text: item.text, topics: item.topics, reason_text: item.reason_text }}
            tagCommentPrompt={config.common.tag_comment_prompt}
            skipLabel={config.common.probe_skip_label}
          />
          <p className="text-sm text-muted">Every answer is saved as you go. Only you can see them until you have both finished, and you can pause any time.</p>
        </>
      ) : (
        <Waiting title="Loading the next question…" />
      )}
    </div>
  );
}
