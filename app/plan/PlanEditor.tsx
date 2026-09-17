"use client";

import { useMemo, useState, useTransition } from "react";
import type { PlanItem, ParentingLines } from "@/lib/data/brief_plan";
import { isMismatch, normalizeItems, PARENTING_LINES, validateForClose, validateForSave, type PlanIssue } from "@/lib/plan/rules";
import type { Domain } from "@/instruments/schema";
import { Button } from "@/app/_components/Button";
import { Card, Chip } from "@/app/_components/Card";
import { Notice } from "@/app/_components/Field";
import { savePlan } from "./actions";

type DomainTab = { domain: Domain; title: string; weight: number };

const EMPTY_LINES: ParentingLines = { children_questioning_adults: "", who_corrects_and_how: "", structure_vs_freedom: "", language_and_modeling_standard: "", adults_disagreeing_in_front_of_child: "" };

const STATUS_LABEL: Record<PlanItem["status"], string> = { active: "Active", parked: "Parked", closed: "Closed" };

/**
 * The plan, one topic per card. Rules from lib/plan/rules: a requirement for both is pinned and
 * takes no date; one requirement against one preference needs a date; parked items stay parked;
 * the parenting topic needs its five lines before it can close. Every save is a new version.
 */
export function PlanEditor({ initialItems, initialLines, domains, names, hasChildren, version }: { initialItems: PlanItem[]; initialLines: ParentingLines | null; domains: DomainTab[]; names: { a: string; b: string }; hasChildren: boolean; version: number | null }) {
  const [items, setItems] = useState<PlanItem[]>(() => normalizeItems(initialItems));
  const [lines, setLines] = useState<ParentingLines>(initialLines ?? EMPTY_LINES);
  const [tab, setTab] = useState<Domain>(domains[0]?.domain ?? "communication");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<PlanIssue[]>([]);
  const [closeIssues, setCloseIssues] = useState<PlanIssue[]>([]);

  const saveIssues = useMemo(() => validateForSave(items), [items]);
  const issuesFor = (index: number, field?: string) => [...saveIssues, ...serverIssues].filter((i) => i.index === index && (!field || i.field === field));
  const rows = items.map((it, index) => ({ it, index })).filter((r) => r.it.domain === tab);
  const parentingLines = hasChildren ? lines : null;
  const domainClosed = (d: Domain) => validateForClose(items, d, parentingLines).length === 0 && items.some((it) => it.domain === d);
  const tabTitle = domains.find((d) => d.domain === tab)?.title ?? tab;

  const update = (index: number, patch: Partial<PlanItem>) => {
    setItems((prev) => normalizeItems(prev.map((it, i) => (i === index ? { ...it, ...patch } : it))));
    setServerIssues([]);
  };
  const add = () => setItems((prev) => normalizeItems([...prev, { domain: tab, topic: "", agreed: "", a_does: "", b_does: "", revisit_date: null, status: "active" }]));
  const remove = (index: number) => setItems((prev) => normalizeItems(prev.filter((_, i) => i !== index)));

  const persist = (after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await savePlan({ items, parentingLines });
      if (!r.ok) {
        setServerIssues(r.issues ?? []);
        setMsg({ ok: false, text: r.error });
        return;
      }
      setMsg({ ok: true, text: r.message ?? "Saved." });
      after?.();
    });

  const closeDomain = () => {
    const issues = validateForClose(items, tab, parentingLines);
    setCloseIssues(issues);
    if (issues.length) return;
    const i = domains.findIndex((d) => d.domain === tab);
    persist(() => {
      setMsg({ ok: true, text: `${domains[i]?.title ?? tab} is closed for this sitting.` });
      if (i >= 0 && i < domains.length - 1) setTab(domains[i + 1].domain);
    });
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Topics, one per sitting" className="flex flex-wrap gap-2">
        {domains.map((d) => (
          <button
            key={d.domain}
            role="tab"
            type="button"
            aria-selected={tab === d.domain}
            onClick={() => {
              setTab(d.domain);
              setCloseIssues([]);
            }}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${tab === d.domain ? "border-accent bg-accent text-accent-ink" : "border-rule bg-surface hover:bg-tint"}`}
          >
            {d.title}
            {domainClosed(d.domain) ? " ✓" : ""}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-4">
        {rows.length === 0 ? (
          <Card dashed as="div">
            <p className="reading text-[17px] text-muted">Nothing in {tabTitle} yet.</p>
          </Card>
        ) : null}

        {rows.map(({ it, index }) => {
          const topicIssues = issuesFor(index, "topic");
          const dateIssues = issuesFor(index, "revisit_date");
          return (
            <Card key={index} as="article" className={it.pinned ? "border-accent/40" : ""}>
              <div className="flex flex-wrap items-center gap-2">
                {it.pinned ? <Chip tone="accent">Requirement for both, settled</Chip> : null}
                {it.status !== "active" && !it.pinned ? <Chip>{STATUS_LABEL[it.status]}</Chip> : null}
                {it.a_tag || it.b_tag ? (
                  <span className="text-xs text-muted">
                    {names.a}: {it.a_tag ?? "no tag"} · {names.b}: {it.b_tag ?? "no tag"}
                  </span>
                ) : null}
              </div>

              <label htmlFor={`topic-${index}`} className="mt-3 block text-sm font-medium">
                Topic
              </label>
              <input id={`topic-${index}`} type="text" value={it.topic} onChange={(e) => update(index, { topic: e.target.value })} className="mt-1 w-full font-display text-[19px]" aria-invalid={topicIssues.length > 0} placeholder="What this is about" />
              {topicIssues.map((i, k) => (
                <p key={k} role="alert" className="mt-1 text-sm text-warn">
                  {i.message}
                </p>
              ))}

              <label htmlFor={`agreed-${index}`} className="mt-4 block text-sm font-medium">
                What we agreed
              </label>
              <textarea id={`agreed-${index}`} rows={2} value={it.agreed} onChange={(e) => update(index, { agreed: e.target.value })} className="mt-1 w-full" />

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`a-${index}`} className="block text-sm font-medium">
                    {names.a} does
                  </label>
                  <textarea id={`a-${index}`} rows={2} value={it.a_does} onChange={(e) => update(index, { a_does: e.target.value })} className="mt-1 w-full" />
                </div>
                <div>
                  <label htmlFor={`b-${index}`} className="block text-sm font-medium">
                    {names.b} does
                  </label>
                  <textarea id={`b-${index}`} rows={2} value={it.b_does} onChange={(e) => update(index, { b_does: e.target.value })} className="mt-1 w-full" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-rule/70 pt-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label htmlFor={`date-${index}`} className="block text-sm font-medium">
                      Look at it again on
                    </label>
                    <input id={`date-${index}`} type="date" value={it.revisit_date ?? ""} disabled={!!it.pinned} onChange={(e) => update(index, { revisit_date: e.target.value || null })} aria-invalid={dateIssues.length > 0} className="mt-1" />
                  </div>
                  <div>
                    <label htmlFor={`status-${index}`} className="block text-sm font-medium">
                      Status
                    </label>
                    <select id={`status-${index}`} value={it.status} onChange={(e) => update(index, { status: e.target.value as PlanItem["status"] })} className="mt-1">
                      {(["active", "parked", "closed"] as const).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="button" onClick={() => remove(index)} className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink" aria-label={`Remove ${it.topic || `item ${index + 1}`}`}>
                  Remove
                </button>
              </div>
              {it.pinned ? <p className="mt-2 text-sm text-muted">Settled between you; it takes no date.</p> : null}
              {isMismatch(it) ? <p className="mt-2 text-sm text-muted">One of you called this a requirement and the other a preference, so it needs a date to look at it again.</p> : null}
              {dateIssues.map((i, k) => (
                <p key={k} role="alert" className="mt-1 text-sm text-warn">
                  {i.message}
                </p>
              ))}
            </Card>
          );
        })}

        <Button type="button" variant="secondary" onClick={add}>
          Add a topic to {tabTitle}
        </Button>

        {tab === "parenting" && hasChildren ? (
          <Card as="section">
            <h3 className="text-[20px]">The five parenting lines</h3>
            <p className="reading mt-1 text-[16px] text-muted">Parenting can close for this sitting once each of these has a line.</p>
            <div className="mt-3 grid gap-4">
              {PARENTING_LINES.map((l) => (
                <div key={l.key}>
                  <label htmlFor={`line-${l.key}`} className="block text-sm font-medium">
                    {l.label}
                  </label>
                  <textarea id={`line-${l.key}`} rows={2} required value={lines[l.key]} onChange={(e) => setLines((s) => ({ ...s, [l.key]: e.target.value }))} className="mt-1 w-full" />
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {closeIssues.length > 0 ? (
          <div role="alert" className="rounded-control border border-warn bg-warn-bg p-3.5 text-sm">
            <p className="font-medium">{tabTitle} can&rsquo;t close yet:</p>
            <ul className="mt-1 list-disc pl-5">
              {closeIssues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {msg ? <Notice tone={msg.ok ? "good" : "warn"}>{msg.text}</Notice> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => persist()} disabled={pending || saveIssues.length > 0} aria-busy={pending}>
            {pending ? "Saving…" : version ? `Save as version ${version + 1}` : "Save version 1"}
          </Button>
          <Button type="button" variant="secondary" onClick={closeDomain} disabled={pending}>
            Close {tabTitle} for this sitting
          </Button>
        </div>
        {saveIssues.length > 0 ? <p className="text-sm text-muted">Saving waits until the notes above are sorted.</p> : null}
      </div>
    </div>
  );
}
