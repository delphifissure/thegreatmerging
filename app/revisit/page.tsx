import Link from "next/link";
import * as data from "@/lib/data";
import type { PlanItem } from "@/lib/data/brief_plan";
import { DOMAIN_TITLES, PART_TITLES } from "@/lib/copy";
import { requirePartner } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";
import { RevisitForm } from "./RevisitForm";

export const metadata = { title: "Revisits" };

/** Revisits split by due state, computed once per request outside render. */
async function loadRevisits(coupleId: string) {
  const [plan, revisits] = await Promise.all([data.getLatestPlan(coupleId), data.listRevisits(coupleId)]);
  const items = (plan?.items as PlanItem[] | undefined) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return {
    plan,
    items,
    due: revisits.filter((r) => !r.completed_at && r.due_date <= today),
    upcoming: revisits.filter((r) => !r.completed_at && r.due_date > today),
    done: revisits.filter((r) => r.completed_at),
  };
}

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function RevisitPage() {
  const user = await requirePartner();
  const [{ plan, items, due, upcoming, done }, members] = await Promise.all([loadRevisits(user.couple.id), data.listCoupleUsers(user.couple.id)]);
  const names = { a: members.find((m) => m.side === "a")?.display_name ?? "A", b: members.find((m) => m.side === "b")?.display_name ?? "B" };
  const itemOf = (i: number) => items[i];

  return (
    <div className="space-y-6">
      <PageHeader title="Revisits" lede="Only what is due, with what you agreed shown again. One question each." />

      <Card>
        <h2 className="text-[22px]">Due now</h2>
        {!plan ? (
          <p className="reading mt-2 text-[17px] text-muted">
            There is no plan yet.{" "}
            <Link href="/plan" className="underline">
              Write one
            </Link>
            .
          </p>
        ) : due.length === 0 ? (
          <p className="reading mt-2 text-[17px] text-muted">Nothing is due today.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule">
            {due.map((r) => {
              const it = itemOf(r.item_index);
              return (
                <li key={r.id} className="py-4 first:pt-1 last:pb-0">
                  <p className="eyebrow">
                    {it ? DOMAIN_TITLES[it.domain] : "Plan item"} · due {niceDate(r.due_date)}
                  </p>
                  <p className="font-display mt-1 text-[20px]">{it?.topic ?? `Item ${r.item_index + 1}`}</p>
                  <blockquote className="reading mt-2 border-l-2 border-rule pl-3 text-[16px]">
                    <p>{it?.agreed || <span className="text-muted">No agreement written down</span>}</p>
                    {it?.a_does || it?.b_does ? (
                      <p className="mt-1 text-muted">
                        {names.a} does: {it?.a_does || "—"}. {names.b} does: {it?.b_does || "—"}.
                      </p>
                    ) : null}
                  </blockquote>
                  <RevisitForm revisitId={r.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <h2 className="text-[22px]">Coming up</h2>
          <ul className="mt-2 space-y-1.5 text-[15px]">
            {upcoming.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-x-4">
                <span className="reading text-[16px]">{itemOf(r.item_index)?.topic ?? `Item ${r.item_index + 1}`}</span>
                <span className="text-muted tabular-nums">{niceDate(r.due_date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {done.length > 0 ? (
        <Card>
          <h2 className="text-[22px]">Already looked at</h2>
          <ul className="mt-2 space-y-1.5 text-[15px]">
            {done.map((r) => (
              <li key={r.id}>
                <span className="text-muted tabular-nums">{niceDate(r.due_date)}:</span> <span className="reading text-[16px]">{itemOf(r.item_index)?.topic ?? `Item ${r.item_index + 1}`}</span>, {r.outcome?.replace(/_/g, " ")}
                {r.notes ? <span className="text-muted"> ({r.notes})</span> : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-[22px]">Start again</h2>
        <p className="reading mt-1 text-[16px] text-muted">After a big change, or after a year, both of you go back to {PART_TITLES.layer0} and answer again. Results are then shown against the earlier ones.</p>
        <div className="mt-3">
          <LinkButton href="/instruments" variant="secondary">
            Back to the questionnaires
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
