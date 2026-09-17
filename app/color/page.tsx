import Link from "next/link";
import * as data from "@/lib/data";
import type { MachineState } from "@/lib/color/machine";
import { requirePartner } from "@/app/_lib/session";
import { DOMAIN_TITLES } from "@/app/_lib/results";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { LinkButton } from "@/app/_components/Button";
import { flaggedDomainsFor } from "./_lib/context";

export const metadata = { title: "Written questions" };

export default async function ColorIndexPage() {
  const user = await requirePartner();
  const run = await data.getLatestRun(user.couple.id);
  if (!run || run.status !== "complete") {
    return (
      <div className="space-y-6">
        <PageHeader title="Written questions" />
        <Waiting title="Nothing to write about yet.">
          <Link href="/waiting" className="underline">
            Waiting room
          </Link>
        </Waiting>
      </div>
    );
  }
  const [flagged, sessions] = await Promise.all([flaggedDomainsFor(user.id, user.couple.id), data.listOwnSessions(user.id, user.couple.id)]);
  const statusOf = (domain: string) => {
    const s = sessions.find((x) => x.domain === domain);
    if (!s) return "Not started";
    return s.status === "complete" && (s.state as MachineState).state === "complete" ? "Complete" : "In progress";
  };
  const allDone = flagged.length > 0 && flagged.every((d) => statusOf(d.domain) === "Complete");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Written questions, one domain at a time"
        lede="Only the domains that flagged. Each of you writes alone; nothing you write is shown until your partner has finished too. Highest weight first."
      />
      {flagged.length === 0 ? (
        <Card>
          <p>No domain flagged, so there is nothing to write here.</p>
          <div className="mt-3">
            <LinkButton href="/brief">Go to the brief</LinkButton>
          </div>
        </Card>
      ) : (
        <Card>
          <ol className="divide-y divide-border">
            {flagged.map((d, i) => (
              <li key={d.domain} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/color/${d.domain}`} className="font-medium underline">
                    {i + 1}. {DOMAIN_TITLES[d.domain]}
                  </Link>
                  <span className="ml-2 text-xs text-muted">weight {d.weight}</span>
                </div>
                <span className="text-sm text-muted">{statusOf(d.domain)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {allDone ? (
        <Card>
          <p>You have finished every flagged domain.</p>
          <div className="mt-3">
            <LinkButton href="/brief">Go to the brief</LinkButton>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
