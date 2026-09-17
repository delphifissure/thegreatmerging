import Link from "next/link";
import * as data from "@/lib/data";
import type { PlanItem } from "@/lib/data/brief_plan";
import { requirePartner } from "@/app/_lib/session";
import { DOMAIN_TITLES } from "@/app/_lib/results";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";
import { RevisitForm } from "./RevisitForm";

export const metadata = { title: "Revisits" };

/** Revisits split by due state, computed once per request outside render. */
async function loadRevisits(coupleId: string) {
  const plan = await data.getLatestPlan(coupleId);
  const items = (plan?.items as PlanItem[] | undefined) ?? [];
  const revisits = await data.listRevisits(coupleId);
  const today = new Date().toISOString().slice(0, 10);
  return {
    plan,
    items,
    due: revisits.filter((r) => !r.completed_at && r.due_date <= today),
    upcoming: revisits.filter((r) => !r.completed_at && r.due_date > today),
    done: revisits.filter((r) => r.completed_at),
  };
}

export default async function RevisitPage() {
  const user = await requirePartner();
  const { plan, items, due, upcoming, done } = await loadRevisits(user.couple.id);
  const itemOf = (i: number) => items[i];

  return (
    <div className="space-y-6">
      <PageHeader title="Revisits" lede="Only the items that are due, with the original agreement shown. One question each." />

      <Card>
        <h2 className="text-lg font-semibold">Due now</h2>
        {!plan ? (
          <p className="mt-2 text-sm text-muted">
            There is no plan yet.{" "}
            <Link href="/plan" className="underline">
              Write one
            </Link>
            .
          </p>
        ) : due.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing is due today.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {due.map((r) => {
              const it = itemOf(r.item_index);
              return (
                <li key={r.id} className="py-4">
                  <p className="text-xs uppercase text-muted">
                    {it ? DOMAIN_TITLES[it.domain] : "Plan item"} · due {r.due_date}
                  </p>
                  <p className="font-medium">{it?.topic ?? `Item ${r.item_index + 1}`}</p>
                  <blockquote className="mt-1 border-l-2 border-border pl-3 text-sm">
                    <p>{it?.agreed || "(no agreement text)"}</p>
                    {it?.a_does || it?.b_does ? (
                      <p className="mt-1 text-muted">
                        A does: {it?.a_does || "—"}. B does: {it?.b_does || "—"}.
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
          <h2 className="text-lg font-semibold">Coming up</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((r) => (
              <li key={r.id}>
                {r.due_date}: {itemOf(r.item_index)?.topic ?? `Item ${r.item_index + 1}`}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {done.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">Already looked at</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {done.map((r) => (
              <li key={r.id}>
                {r.due_date}: {itemOf(r.item_index)?.topic ?? `Item ${r.item_index + 1}`} — {r.outcome?.replace(/_/g, " ")}
                {r.notes ? ` (${r.notes})` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Retake</h2>
        <p className="mt-1 text-sm text-muted">After a major change, or after twelve months, both of you go back to Layer 0 and answer again. Results are then shown against the earlier ones.</p>
        <div className="mt-3">
          <LinkButton href="/instruments" variant="secondary">
            Return to Layer 0
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
