import Link from "next/link";
import * as data from "@/lib/data";
import type { MachineState } from "@/lib/color/machine";
import { DOMAIN_TITLES, topicEmphasis } from "@/lib/copy";
import { requirePartner } from "@/app/_lib/session";
import { Card, Chip } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { LinkButton } from "@/app/_components/Button";
import { flaggedDomainsFor } from "./_lib/context";

export const metadata = { title: "In your own words" };

export default async function ColorIndexPage() {
  const user = await requirePartner();
  const run = await data.getLatestRun(user.couple.id);
  if (!run || run.status !== "complete") {
    return (
      <div className="space-y-6">
        <PageHeader title="In your own words" />
        <Waiting title="Nothing to write about yet.">
          <Link href="/waiting" className="underline">
            Where you both are
          </Link>
        </Waiting>
      </div>
    );
  }
  const [flagged, sessions] = await Promise.all([flaggedDomainsFor(user.id, user.couple.id), data.listOwnSessions(user.id, user.couple.id)]);
  const statusOf = (domain: string) => {
    const s = sessions.find((x) => x.domain === domain);
    if (!s) return "Not started";
    return s.status === "complete" && (s.state as MachineState).state === "complete" ? "Done" : "In progress";
  };
  const allDone = flagged.length > 0 && flagged.every((d) => statusOf(d.domain) === "Done");
  const nextUp = flagged.find((d) => statusOf(d.domain) !== "Done") ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="In your own words"
        lede="A few questions on each topic that came up, most first. You write alone, and nothing you write is shown until your partner has finished too."
      />
      {flagged.length === 0 ? (
        <Card>
          <p className="reading text-[17px]">Nothing came up, so there is nothing to write here.</p>
          <div className="mt-3">
            <LinkButton href="/brief">Go to the brief</LinkButton>
          </div>
        </Card>
      ) : (
        <Card>
          <ol className="divide-y divide-rule">
            {flagged.map((d, i) => {
              const e = topicEmphasis(i);
              const status = statusOf(d.domain);
              return (
                <li key={d.domain} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/color/${d.domain}`} className="font-display text-[19px] hover:underline">
                      {DOMAIN_TITLES[d.domain]}
                    </Link>
                    <Chip tone={e.tone}>{e.label}</Chip>
                  </div>
                  <span className={`text-sm ${status === "Done" ? "text-good" : "text-muted"}`}>{status}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            {nextUp ? <LinkButton href={`/color/${nextUp.domain}`}>{statusOf(nextUp.domain) === "Not started" ? `Start with ${DOMAIN_TITLES[nextUp.domain]}` : `Continue ${DOMAIN_TITLES[nextUp.domain]}`}</LinkButton> : null}
            {allDone ? <LinkButton href="/brief">Go to the brief</LinkButton> : null}
          </div>
        </Card>
      )}
    </div>
  );
}
