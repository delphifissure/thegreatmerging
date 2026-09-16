import Link from "next/link";
import * as data from "@/lib/data";
import { orderBriefs } from "@/lib/brief/build";
import { BriefDomainSchema, InterpreterOutputSchema, type BriefDomain } from "@/lib/llm/schemas";
import { requirePartner } from "@/app/_lib/session";
import { DOMAIN_TITLES } from "@/app/_lib/results";
import { descriptorMap } from "@/app/_lib/descriptors";
import { Card, GeneratedLabel } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { LinkButton } from "@/app/_components/Button";
import { flaggedDomainsFor } from "@/app/color/_lib/context";
import { BriefSections } from "./_components/BriefSections";
import { RequestBrief } from "./RequestBrief";

export default async function BriefPage() {
  const user = await requirePartner();
  const run = await data.getLatestRun(user.couple.id);
  const header = <PageHeader title="The brief" lede="A reading view for the two of you at one screen. Everything here was written by the interpreter from what each of you answered; nothing is a verdict." />;
  if (!run || run.status !== "complete") {
    return (
      <div className="space-y-6">
        {header}
        <Waiting title={run ? "Interpreting… this takes a few minutes." : "Your partner hasn't finished yet."}>
          <Link href="/waiting" className="underline">
            Waiting room
          </Link>
        </Waiting>
      </div>
    );
  }
  const flagged = await flaggedDomainsFor(user.id, user.couple.id);
  const members = await data.listCoupleUsers(user.couple.id);
  const names = { a: members.find((m) => m.side === "a")?.display_name ?? "A", b: members.find((m) => m.side === "b")?.display_name ?? "B" };
  const briefs: BriefDomain[] = (await data.getBriefs(user.couple.id)).map((b) => BriefDomainSchema.safeParse(b.content)).filter((r) => r.success).map((r) => r.data);

  if (briefs.length === 0) {
    if (flagged.length === 0) {
      const interp = await data.getInterpretation(user.couple.id);
      const parsed = interp ? InterpreterOutputSchema.safeParse(interp.content) : null;
      const aligned = parsed?.success ? parsed.data.domains.flatMap((d) => d.aligned.map((a) => ({ domain: d.domain, ...a }))) : [];
      return (
        <div className="space-y-6">
          {header}
          <Card>
            <h2 className="text-lg font-semibold">No domain flagged</h2>
            <GeneratedLabel />
            <p className="mt-2 text-sm">There were no written questions to answer, so there is no domain brief. What lines up, by name:</p>
            {aligned.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing listed.</p> : (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {aligned.map((a) => (
                  <li key={`${a.domain}:${a.item}`}>
                    <span className="text-muted">{DOMAIN_TITLES[a.domain]}:</span> {a.one_sentence}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <LinkButton href="/plan">Go to the plan</LinkButton>
            </div>
          </Card>
        </div>
      );
    }
    const status = await data.coupleColorStatus(user.couple.id, flagged.map((d) => d.domain));
    const mineDone = flagged.every((d) => status.by_user[user.id]?.[d.domain] === "complete");
    return (
      <div className="space-y-6">
        {header}
        {!mineDone ? (
          <Waiting title="You haven't finished the color layer yet." refresh={false}>
            <Link href="/color" className="underline">
              Back to the written questions
            </Link>
          </Waiting>
        ) : !status.both_complete ? (
          <Waiting title="Your partner hasn't finished the color layer yet.">Nothing is shared until both of you are done.</Waiting>
        ) : (
          <Waiting title="Writing the brief…">
            This takes a few minutes.
            <RequestBrief />
          </Waiting>
        )}
      </div>
    );
  }

  const ordered = orderBriefs(briefs, flagged);
  return (
    <div className="space-y-6">
      {header}
      <BriefSections briefs={ordered} names={names} descriptors={descriptorMap()} />
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/plan">Write the plan</LinkButton>
      </div>
    </div>
  );
}
