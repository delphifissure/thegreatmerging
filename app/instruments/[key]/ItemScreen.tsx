"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Card, UnvalidatedLabel } from "@/app/_components/Card";
import { Notice } from "@/app/_components/Field";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { ScaleField } from "@/app/_components/ScaleField";
import { SafetyScreen } from "@/app/instruments/_components/SafetyScreen";
import { answerKey, GROUP_TITLES, type AnswerMap, type InstrumentView } from "@/app/instruments/_lib/view";
import { finishInstrument, saveAnswer, saveAttribution, setNeedsContext } from "./actions";

type Status = { kind: "idle" | "saving" | "saved" | "error"; text?: string };

export function ItemScreen({ view, initialAnswers, initialIndex }: { view: InstrumentView; initialAnswers: AnswerMap; initialIndex: number }) {
  const router = useRouter();
  const [index, setIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [contextFlags, setContextFlags] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const it of view.items) out[it.item_id] = view.passes.some((p) => initialAnswers[answerKey(p, it.item_id)]?.needs_context);
    return out;
  });
  const [attribution, setAttribution] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [safety, setSafety] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [finishing, startFinish] = useTransition();

  const item = view.items[index];
  const total = view.items.length;
  const answeredItems = useMemo(() => view.items.filter((it) => view.passes.every((p) => answerKey(p, it.item_id) in answers)).length, [view, answers]);
  const allAnswered = answeredItems === total;
  const multi = view.passes.length > 1;
  const needsContext = contextFlags[item.item_id] ?? false;

  const save = (pass: string, value: number) => {
    setAnswers((a) => ({ ...a, [answerKey(pass, item.item_id)]: { value, needs_context: needsContext } }));
    setStatus({ kind: "saving" });
    start(async () => {
      const r = await saveAnswer({ instrumentKey: view.key, itemId: item.item_id, pass, value, needsContext });
      if (!r.ok) {
        setStatus({ kind: "error", text: r.error });
        return;
      }
      setStatus({ kind: "saved" });
      if (r.safetyFlag && r.safetyMessage) setSafety(r.safetyMessage);
    });
  };

  const toggleContext = () => {
    const next = !needsContext;
    setContextFlags((f) => ({ ...f, [item.item_id]: next }));
    setAnswers((a) => {
      const out = { ...a };
      for (const p of view.passes) {
        const k = answerKey(p, item.item_id);
        if (out[k]) out[k] = { ...out[k], needs_context: next };
      }
      return out;
    });
    start(async () => {
      const r = await setNeedsContext({ instrumentKey: view.key, itemId: item.item_id, needsContext: next });
      setStatus(r.ok ? { kind: "saved" } : { kind: "error", text: r.error });
    });
  };

  const polarizationGap = (() => {
    if (view.key !== "polarization" || view.attribution_gap_at_or_above === null) return null;
    const a = answers[answerKey("self_alone", item.item_id)]?.value;
    const b = answers[answerKey("self_with_partner", item.item_id)]?.value;
    const c = answers[answerKey("partner_becomes", item.item_id)]?.value;
    if (a === undefined || b === undefined || c === undefined) return null;
    return Math.abs(a - b) >= view.attribution_gap_at_or_above ? { a, b } : null;
  })();

  const go = (n: number) => {
    setIndex(Math.max(0, Math.min(total - 1, n)));
    setStatus({ kind: "idle" });
  };

  return (
    <div className="space-y-4">
      {safety ? <SafetyScreen message={safety} onContinue={() => setSafety(null)} /> : null}
      <div>
        <Link href="/instruments" className="text-sm underline">
          Back to all instruments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {view.name}
          {view.unvalidated ? <UnvalidatedLabel /> : null}
        </h1>
        <p className="text-sm text-muted">Source: {view.source_citation}</p>
        {view.mental_health ? <p className="mt-1 text-sm text-muted">Your answers here are encrypted and private to you unless you choose to share the score.</p> : null}
      </div>

      <ProgressBar value={answeredItems} max={total} label={`${view.name}: ${answeredItems} of ${total} items answered`} />

      <Card as="article" key={item.item_id}>
        <p className="text-sm text-muted">
          Item {index + 1} of {total}
          {item.group ? ` · ${GROUP_TITLES[item.group] ?? item.group}` : ""}
        </p>
        {item.placeholder ? <Notice tone="warn">Item text not yet populated by the owner. The bracketed descriptor stands in for the official wording.</Notice> : null}
        <h2 className="mt-2 text-lg font-medium">{item.text}</h2>

        {view.passes.map((pass) => (
          <ScaleField
            key={pass}
            name={`${item.item_id}-${pass}`}
            legend={multi ? view.pass_prompts[pass] ?? pass : <span className="sr-only">{item.text}</span>}
            scale={item.scales[pass]}
            value={answers[answerKey(pass, item.item_id)]?.value ?? null}
            onChange={(v) => save(pass, v)}
          />
        ))}

        {polarizationGap && view.attribution_prompt ? (
          <div className="mt-4 rounded border border-border p-3">
            <label htmlFor={`attr-${item.item_id}`} className="block font-medium">
              {view.attribution_prompt}
            </label>
            <p className="text-xs text-muted">
              Left to yourself you chose {polarizationGap.a}; with your partner, {polarizationGap.b}. Optional, in your own words.
            </p>
            <textarea
              id={`attr-${item.item_id}`}
              rows={3}
              className="mt-2 w-full"
              value={attribution[item.item_id] ?? ""}
              onChange={(e) => setAttribution((s) => ({ ...s, [item.item_id]: e.target.value }))}
            />
            <Button
              variant="secondary"
              className="mt-2"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveAttribution({ dimension: item.item_id, text: attribution[item.item_id] ?? "" });
                  setStatus(r.ok ? { kind: "saved", text: "Note saved." } : { kind: "error", text: r.error });
                })
              }
            >
              Save note
            </Button>
          </div>
        ) : null}

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={needsContext} onChange={toggleContext} /> This one needs context
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0}>
            Back
          </Button>
          <Button variant="secondary" onClick={() => go(index + 1)} disabled={index >= total - 1}>
            Next
          </Button>
          <span role="status" aria-live="polite" className="text-sm text-muted">
            {status.kind === "saving" ? "Saving…" : status.kind === "saved" ? status.text ?? "Saved" : status.kind === "error" ? status.text : ""}
          </span>
        </div>
      </Card>

      {allAnswered ? (
        <Card>
          <p>Every item is answered. Finishing marks this instrument complete for you.</p>
          {status.kind === "error" ? <Notice tone="warn">{status.text}</Notice> : null}
          <Button
            className="mt-3"
            disabled={finishing || pending}
            aria-busy={finishing}
            onClick={() =>
              startFinish(async () => {
                const r = await finishInstrument({ instrumentKey: view.key });
                if (r && !r.ok) setStatus({ kind: "error", text: r.error });
                else router.refresh();
              })
            }
          >
            {finishing ? "Finishing…" : "Finish this instrument"}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
