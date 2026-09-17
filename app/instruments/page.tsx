import Link from "next/link";
import * as data from "@/lib/data";
import { PART_TITLES } from "@/lib/copy";
import { requirePartner } from "@/app/_lib/session";
import { Card, Chip, UnvalidatedLabel } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { LinkButton } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";

export const metadata = { title: "Questionnaires" };

function PartList({ title, lede, list }: { title: string; lede: string; list: data.InstrumentProgress[] }) {
  const required = list.filter((p) => p.required);
  const answered = required.reduce((s, p) => s + Math.min(p.answered, p.total), 0);
  const total = required.reduce((s, p) => s + p.total, 0);
  const done = required.every((p) => p.complete);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[22px]">{title}</h2>
        {done ? <Chip tone="accent">Done</Chip> : null}
      </div>
      <p className="reading mt-1 text-[16px] text-muted">{lede}</p>
      <div className="mt-3">
        <ProgressBar value={answered} max={total} label={`${title} progress`} detail={done ? "Done" : `${answered} of ${total}`} />
      </div>
      <ul className="mt-3 divide-y divide-rule">
        {list.map((p) => {
          const state = p.complete ? "Done" : p.answered === 0 ? "Not started" : `${Math.min(p.answered, p.total)} of ${p.total}`;
          return (
            <li key={p.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <Link href={`/instruments/${p.key}`} className="font-display text-[18px] hover:underline">
                  {p.name}
                </Link>
                {p.key === "polarization" ? <UnvalidatedLabel /> : null}
                {p.optional ? <span className="ml-2 text-xs text-muted">optional</span> : null}
              </div>
              <span className={`text-sm tabular-nums ${p.complete ? "text-good" : "text-muted"}`}>{state}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default async function InstrumentsPage() {
  const user = await requirePartner();
  const [progress, run] = await Promise.all([data.getProgress(user.id, user.couple.id), data.getLatestRun(user.couple.id)]);
  const all = [...progress.layer0, ...progress.layer1];
  const allRequiredDone = all.filter((p) => p.required).every((p) => p.complete);
  const nextUp = all.find((p) => p.required && !p.complete) ?? all.find((p) => !p.complete) ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Questionnaires"
        lede="Each of you does this alone. Every answer saves as you go; leave and come back whenever you like. Nothing is compared until both of you are done."
      />
      {!user.couple.partner_b_id ? <Notice>Your partner has not joined yet. You can start anyway; nothing is compared until both of you have finished.</Notice> : null}
      {allRequiredDone ? (
        <Notice tone="good">
          You have finished every required questionnaire.{" "}
          {run ? (
            <Link href="/results" className="underline">
              See where things stand
            </Link>
          ) : (
            <Link href="/waiting" className="underline">
              Check whether your partner has finished
            </Link>
          )}
          .
        </Notice>
      ) : nextUp ? (
        <div>
          <LinkButton href={`/instruments/${nextUp.key}`}>{nextUp.answered === 0 ? `Start: ${nextUp.name}` : `Continue: ${nextUp.name}`}</LinkButton>
        </div>
      ) : null}
      <PartList title={PART_TITLES.layer0} lede="Individual baselines, about 20 minutes. Tick the box on any item that needs context." list={progress.layer0} />
      <PartList title={PART_TITLES.layer1} lede="About 35 minutes, plus a short block of original, unvalidated questions about how you each shift around the other." list={progress.layer1} />
    </div>
  );
}
