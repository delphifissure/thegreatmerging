import Link from "next/link";
import * as data from "@/lib/data";
import { requirePartner } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { LinkButton } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";

export const metadata = { title: "Instruments" };

function LayerList({ title, lede, list }: { title: string; lede: string; list: data.InstrumentProgress[] }) {
  const required = list.filter((p) => p.required);
  const answered = required.reduce((s, p) => s + Math.min(p.answered, p.total), 0);
  const total = required.reduce((s, p) => s + p.total, 0);
  return (
    <Card>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{lede}</p>
      <div className="mt-3">
        <ProgressBar value={answered} max={total} label={`${title} progress (required instruments)`} />
      </div>
      <ul className="mt-4 divide-y divide-border">
        {list.map((p) => (
          <li key={p.key} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link href={`/instruments/${p.key}`} className="font-medium underline">
                  {p.name}
                </Link>
                {p.optional ? <span className="ml-2 text-xs text-muted">optional, easy skip</span> : null}
                {p.key === "polarization" ? <span className="ml-2 rounded border border-warn-border bg-warn-bg px-1.5 py-0.5 text-xs">unvalidated</span> : null}
              </div>
              <span className="text-sm text-muted">{p.complete ? "Complete" : p.answered === 0 ? "Not started" : `${Math.min(p.answered, p.total)} of ${p.total} answered`}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={p.complete ? p.total : p.answered} max={p.total} label={`${p.name} progress`} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function InstrumentsPage() {
  const user = await requirePartner();
  const [progress, run] = await Promise.all([data.getProgress(user.id, user.couple.id), data.getLatestRun(user.couple.id)]);
  const allRequiredDone = [...progress.layer0, ...progress.layer1].filter((p) => p.required).every((p) => p.complete);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Instruments"
        lede="Each of you does this alone. Every answer saves as you go; leave and come back whenever you like. Nothing is compared until both of you are done."
      />
      {!user.couple.partner_b_id ? <Notice>Your partner has not joined yet. You can start anyway; comparisons wait until both of you have finished.</Notice> : null}
      {allRequiredDone ? (
        <Notice>
          You have finished every required instrument.{" "}
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
      ) : null}
      <LayerList title="Layer 0: about you" lede="Individual baselines, about 20 minutes. One checkbox per item if it needs context." list={progress.layer0} />
      <LayerList title="Layer 1: about the relationship" lede="About 35 minutes, plus the short polarization block (original and unvalidated)." list={progress.layer1} />
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/waiting" variant="secondary">
          Waiting room
        </LinkButton>
      </div>
    </div>
  );
}
