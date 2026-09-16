/**
 * Plan rules (section 7), pure:
 *   - items tagged requirement by both partners are pinned at the top and cannot carry a revisit date;
 *   - items where one tagged requirement and the other preference cannot be saved without a date,
 *     and the domain cannot close while any such item lacks one;
 *   - parked items carry over marked parked;
 *   - the parenting domain needs its five named lines before it can close;
 *   - every save is a new version; diffPlans produces the change list shown against the previous.
 */
import type { PlanItem, ParentingLines } from "@/lib/data/brief_plan";
import type { Domain } from "@/instruments/schema";

export const PARENTING_LINES: Array<{ key: keyof ParentingLines; label: string }> = [
  { key: "children_questioning_adults", label: "Children questioning adults" },
  { key: "who_corrects_and_how", label: "Who corrects and how" },
  { key: "structure_vs_freedom", label: "Structure versus freedom for this child at this age" },
  { key: "language_and_modeling_standard", label: "The language and modeling standard adults hold" },
  { key: "adults_disagreeing_in_front_of_child", label: "The protocol for adults disagreeing in front of the child" },
];

export type PlanIssue = { index: number | null; field?: string; message: string };

export function isSharedRequirement(item: PlanItem): boolean {
  return item.a_tag === "requirement" && item.b_tag === "requirement";
}

export function isMismatch(item: PlanItem): boolean {
  return (item.a_tag === "requirement" && item.b_tag === "preference") || (item.a_tag === "preference" && item.b_tag === "requirement");
}

/** Normalize items: pin shared requirements (no date), keep parked items parked. */
export function normalizeItems(items: PlanItem[]): PlanItem[] {
  const normalized = items.map((it) => {
    if (isSharedRequirement(it)) return { ...it, pinned: true, revisit_date: null };
    return { ...it, pinned: false };
  });
  // Pinned first, then active, then parked, then closed; stable within groups.
  const rank = (it: PlanItem) => (it.pinned ? 0 : it.status === "active" ? 1 : it.status === "parked" ? 2 : 3);
  return normalized
    .map((it, i) => ({ it, i }))
    .sort((x, y) => rank(x.it) - rank(y.it) || x.i - y.i)
    .map((x) => x.it);
}

/** Issues that block saving. */
export function validateForSave(items: PlanItem[]): PlanIssue[] {
  const issues: PlanIssue[] = [];
  items.forEach((it, index) => {
    if (!it.topic.trim()) issues.push({ index, field: "topic", message: "Every item needs a topic." });
    if (isSharedRequirement(it) && it.revisit_date) issues.push({ index, field: "revisit_date", message: "A requirement for both of you is settled; it does not take a revisit date." });
    if (isMismatch(it) && it.status === "active" && !it.revisit_date) issues.push({ index, field: "revisit_date", message: "One of you tagged this a requirement and the other a preference. It needs a revisit date before it can be saved." });
    if (it.revisit_date && !/^\d{4}-\d{2}-\d{2}$/.test(it.revisit_date)) issues.push({ index, field: "revisit_date", message: "Use a date in YYYY-MM-DD form." });
  });
  return issues;
}

/** Issues that block closing a domain (everything from save, plus the parenting lines). */
export function validateForClose(items: PlanItem[], domain: Domain, parentingLines: ParentingLines | null): PlanIssue[] {
  const issues = validateForSave(items.filter((it) => it.domain === domain));
  for (const it of items) {
    if (it.domain !== domain) continue;
    if (isMismatch(it) && !it.revisit_date && it.status !== "closed") {
      issues.push({ index: items.indexOf(it), field: "revisit_date", message: "This domain cannot close while a requirement-versus-preference item has no date." });
    }
  }
  if (domain === "parenting") {
    for (const line of PARENTING_LINES) {
      if (!parentingLines || !parentingLines[line.key]?.trim()) issues.push({ index: null, field: line.key, message: `The parenting plan needs a line for: ${line.label}.` });
    }
  }
  return issues;
}

export type PlanDiff = Array<{ kind: "added" | "removed" | "changed"; index: number; topic: string; fields?: Array<{ field: keyof PlanItem; before: unknown; after: unknown }> }>;

const DIFF_FIELDS: Array<keyof PlanItem> = ["topic", "agreed", "a_does", "b_does", "revisit_date", "status", "domain"];

/** Diff by topic within domain (the plan's natural key); index refers to the newer version. */
export function diffPlans(prev: PlanItem[], next: PlanItem[]): PlanDiff {
  const key = (it: PlanItem) => `${it.domain}::${it.item_ref ?? it.topic.trim().toLowerCase()}`;
  const prevMap = new Map(prev.map((it) => [key(it), it]));
  const nextKeys = new Set(next.map(key));
  const out: PlanDiff = [];
  next.forEach((it, index) => {
    const before = prevMap.get(key(it));
    if (!before) {
      out.push({ kind: "added", index, topic: it.topic });
      return;
    }
    const fields = DIFF_FIELDS.filter((f) => (before[f] ?? null) !== (it[f] ?? null)).map((f) => ({ field: f, before: before[f] ?? null, after: it[f] ?? null }));
    if (fields.length) out.push({ kind: "changed", index, topic: it.topic, fields });
  });
  prev.forEach((it, index) => {
    if (!nextKeys.has(key(it))) out.push({ kind: "removed", index, topic: it.topic });
  });
  return out;
}
