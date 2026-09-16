"use client";

import { useMemo, useState, useTransition } from "react";
import type { PlanItem, ParentingLines } from "@/lib/data/brief_plan";
import { isMismatch, normalizeItems, PARENTING_LINES, validateForClose, validateForSave, type PlanIssue } from "@/lib/plan/rules";
import type { Domain } from "@/instruments/schema";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { savePlan } from "./actions";

type DomainTab = { domain: Domain; title: string; weight: number };

const EMPTY_LINES: ParentingLines = { children_questioning_adults: "", who_corrects_and_how: "", structure_vs_freedom: "", language_and_modeling_standard: "", adults_disagreeing_in_front_of_child: "" };

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
      <div role="tablist" aria-label="Domains, one per sitting" className="flex flex-wrap gap-2">
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
            className={`rounded border px-3 py-1.5 text-sm ${tab === d.domain ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface"}`}
          >
            {d.title}
            {domainClosed(d.domain) ? " ✓" : ""}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">What we agreed</th>
                <th scope="col">{names.a} does</th>
                <th scope="col">{names.b} does</th>
                <th scope="col">Revisit</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No items in this domain yet.
                  </td>
                </tr>
              ) : null}
              {rows.map(({ it, index }) => {
                const rowIssues = issuesFor(index);
                return (
                  <tr key={index} className={it.pinned ? "bg-bar-track" : undefined}>
                    <td>
                      <label className="sr-only" htmlFor={`topic-${index}`}>
                        Topic
                      </label>
                      <input id={`topic-${index}`} type="text" value={it.topic} onChange={(e) => update(index, { topic: e.target.value })} className="w-40" aria-invalid={issuesFor(index, "topic").length > 0} />
                      {it.pinned ? <p className="mt-1 text-xs">Requirement for both: pinned, settled.</p> : null}
                      {isMismatch(it) ? <p className="mt-1 text-xs text-muted">One requirement, one preference: needs a date.</p> : null}
                      {it.a_tag || it.b_tag ? (
                        <p className="mt-1 text-xs text-muted">
                          {names.a}: {it.a_tag ?? "no tag"}; {names.b}: {it.b_tag ?? "no tag"}
                        </p>
                      ) : null}
                      {rowIssues.map((i, k) => (
                        <p key={k} role="alert" className="mt-1 text-xs text-warn-border">
                          {i.message}
                        </p>
                      ))}
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`agreed-${index}`}>
                        What we agreed
                      </label>
                      <textarea id={`agreed-${index}`} rows={2} value={it.agreed} onChange={(e) => update(index, { agreed: e.target.value })} className="w-48" />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`a-${index}`}>
                        {names.a} does
                      </label>
                      <textarea id={`a-${index}`} rows={2} value={it.a_does} onChange={(e) => update(index, { a_does: e.target.value })} className="w-36" />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`b-${index}`}>
                        {names.b} does
                      </label>
                      <textarea id={`b-${index}`} rows={2} value={it.b_does} onChange={(e) => update(index, { b_does: e.target.value })} className="w-36" />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`date-${index}`}>
                        Revisit date
                      </label>
                      <input id={`date-${index}`} type="date" value={it.revisit_date ?? ""} disabled={!!it.pinned} onChange={(e) => update(index, { revisit_date: e.target.value || null })} aria-invalid={issuesFor(index, "revisit_date").length > 0} />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`status-${index}`}>
                        Status
                      </label>
                      <select id={`status-${index}`} value={it.status} onChange={(e) => update(index, { status: e.target.value as PlanItem["status"] })}>
                        <option value="active">active</option>
                        <option value="parked">parked</option>
                        <option value="closed">closed</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" onClick={() => remove(index)} className="text-xs underline" aria-label={`Remove item ${it.topic || index + 1}`}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="secondary" onClick={add}>
          Add an item to {domains.find((d) => d.domain === tab)?.title ?? tab}
        </Button>

        {tab === "parenting" && hasChildren ? (
          <fieldset className="rounded border border-border p-3">
            <legend className="font-medium">The five parenting lines (required before this domain can close)</legend>
            <div className="mt-2 grid gap-3">
              {PARENTING_LINES.map((l) => (
                <div key={l.key}>
                  <label htmlFor={`line-${l.key}`} className="block text-sm">
                    {l.label}
                  </label>
                  <textarea id={`line-${l.key}`} rows={2} required value={lines[l.key]} onChange={(e) => setLines((s) => ({ ...s, [l.key]: e.target.value }))} className="w-full" />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}

        {closeIssues.length > 0 ? (
          <div role="alert" className="rounded border border-warn-border bg-warn-bg p-3 text-sm">
            <p className="font-medium">This domain cannot close yet:</p>
            <ul className="mt-1 list-disc pl-5">
              {closeIssues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {msg ? <Notice tone={msg.ok ? "info" : "warn"}>{msg.text}</Notice> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => persist()} disabled={pending || saveIssues.length > 0} aria-busy={pending}>
            {pending ? "Saving…" : version ? `Save as version ${version + 1}` : "Save version 1"}
          </Button>
          <Button type="button" variant="secondary" onClick={closeDomain} disabled={pending}>
            Close this domain
          </Button>
        </div>
        {saveIssues.length > 0 ? <p className="text-xs text-muted">Saving is blocked until the items above are fixed.</p> : null}
      </div>
    </div>
  );
}
