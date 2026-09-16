import Link from "next/link";
import * as data from "@/lib/data";
import type { PlanItem, ParentingLines } from "@/lib/data/brief_plan";
import { BriefDomainSchema } from "@/lib/llm/schemas";
import { diffPlans } from "@/lib/plan/rules";
import type { Domain } from "@/instruments/schema";
import { requirePartner } from "@/app/_lib/session";
import { DOMAIN_TITLES } from "@/app/_lib/results";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { flaggedDomainsFor } from "@/app/color/_lib/context";
import { descriptorMap } from "@/app/_lib/descriptors";
import { ExportButtons } from "@/app/results/profile/_components/ExportButtons";
import { ExportList } from "@/app/results/profile/_components/ExportList";
import { PlanEditor } from "./PlanEditor";

/** First-version seed: tags side by side from each brief, parked items, then flagged items not already present. */
async function seedItems(coupleId: string, descriptors: Record<string, string>): Promise<PlanItem[]> {
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  const briefs = (await data.getBriefs(coupleId)).map((b) => BriefDomainSchema.safeParse(b.content)).filter((r) => r.success).map((r) => r.data);
  for (const b of briefs) {
    for (const t of b.tags_side_by_side) {
      if (seen.has(t.item_ref)) continue;
      seen.add(t.item_ref);
      items.push({ domain: b.domain, topic: descriptors[t.item_ref] ?? t.item_ref, agreed: "", a_does: "", b_does: "", revisit_date: null, status: "active", item_ref: t.item_ref, a_tag: t.a_tag, b_tag: t.b_tag });
    }
    for (const p of b.parked_items) {
      const key = `parked:${b.domain}:${p}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ domain: b.domain, topic: p, agreed: "", a_does: "", b_does: "", revisit_date: null, status: "parked" });
    }
  }
  for (const f of await data.getFlags(coupleId)) {
    const t = f.triggered_by as { item?: string; descriptor?: string };
    if (!t.item || seen.has(t.item)) continue;
    seen.add(t.item);
    items.push({ domain: f.domain as Domain, topic: t.descriptor ?? descriptors[t.item] ?? t.item, agreed: "", a_does: "", b_does: "", revisit_date: null, status: "active", item_ref: t.item });
  }
  return items;
}

export default async function PlanPage() {
  const user = await requirePartner();
  const run = await data.getLatestRun(user.couple.id);
  const header = <PageHeader title="The plan" lede="Together, one domain per sitting. For every item: the topic, what we agreed, what each of you does, and when you look at it again." />;
  if (!run || run.status !== "complete") {
    return (
      <div className="space-y-6">
        {header}
        <Waiting title="The plan opens after the brief.">
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
  const versions = await data.listPlanVersions(user.couple.id);
  const latest = versions[versions.length - 1] ?? null;
  const previous = versions.length >= 2 ? versions[versions.length - 2] : null;
  const descriptors = descriptorMap();
  const items = latest ? (latest.items as PlanItem[]) : await seedItems(user.couple.id, descriptors);
  const lines = (latest?.parenting_lines as ParentingLines | null) ?? null;
  const tabDomains = [...flagged.map((d) => d.domain), ...items.map((i) => i.domain)];
  if (user.couple.has_children) tabDomains.push("parenting");
  const domains = [...new Set(tabDomains)].map((d) => ({ domain: d, title: DOMAIN_TITLES[d], weight: flagged.find((f) => f.domain === d)?.weight ?? 0 })).sort((x, y) => y.weight - x.weight);
  const diff = latest && previous ? diffPlans(previous.items as PlanItem[], latest.items as PlanItem[]) : [];

  return (
    <div className="space-y-6">
      {header}
      <Card>
        <p className="text-sm text-muted">
          {latest ? `Version ${latest.version}. Every save creates a new version.` : "No plan yet. The items below were seeded from the brief's tags and the flagged items; edit freely, then save version 1."} Requirements for both of
          you are pinned at the top and take no date. A requirement-versus-preference mismatch needs a date before it can be saved. Parked items carry over marked parked.
        </p>
      </Card>
      <PlanEditor initialItems={items} initialLines={lines} domains={domains} names={names} hasChildren={user.couple.has_children} version={latest?.version ?? null} />

      {latest && previous ? (
        <Card>
          <h2 className="text-lg font-semibold">
            Changes from version {previous.version} to {latest.version}
          </h2>
          {diff.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No item changed.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {diff.map((d, i) => (
                <li key={i}>
                  <strong className="capitalize">{d.kind}</strong>: {d.topic || "(untitled)"}
                  {d.fields ? ` — ${d.fields.map((f) => `${String(f.field).replace(/_/g, " ")}: "${f.before ?? ""}" → "${f.after ?? ""}"`).join("; ")}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Export</h2>
        <p className="mt-1 text-sm text-muted">One-page plan or the brief, as Markdown or PDF. Instrument scores are labelled by source; everything derived is labelled generated by the interpreter; not validated.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Plan</p>
            <ExportButtons kind="plan" />
          </div>
          <div>
            <p className="text-sm font-medium">Brief</p>
            <ExportButtons kind="brief" />
          </div>
        </div>
        <ExportList coupleId={user.couple.id} userId={user.id} kinds={["plan", "brief"]} />
      </Card>
      <p className="text-sm">
        <Link href="/revisit" className="underline">
          Revisits
        </Link>
      </p>
    </div>
  );
}
