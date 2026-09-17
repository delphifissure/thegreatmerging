"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, LinkButton } from "@/app/_components/Button";
import { Card, UnvalidatedLabel } from "@/app/_components/Card";
import { Notice } from "@/app/_components/Field";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { ScaleField } from "@/app/_components/ScaleField";
import { SafetyScreen } from "@/app/instruments/_components/SafetyScreen";
import { answerKey, GROUP_TITLES, type AnswerMap, type InstrumentView } from "@/app/instruments/_lib/view";
import { finishInstrument, saveAnswer, saveAttribution, setNeedsContext } from "./actions";

type Status = { kind: "idle" | "saving" | "saved" | "error"; text?: string };
type Phase = "idle" | "leaving" | "arriving";

/** Rough pace for the time-left estimate. */
const SECONDS_PER_ITEM = 14;
const LEAVE_MS = 220;
const ARRIVE_MS = 320;
const SETTLE_MS = 380;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * The runner: one item at a time. Choosing an answer saves it, settles, and moves on by itself; Back
 * and Next stay for changing your mind or leaving one for later. When the last answer lands, a
 * milestone card takes the item's place.
 */
export function ItemScreen({ view, initialAnswers, initialIndex }: { view: InstrumentView; initialAnswers: AnswerMap; initialIndex: number }) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(initialIndex);
  const [phase, setPhase] = useState<Phase>("idle");
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [contextFlags, setContextFlags] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const it of view.items) out[it.item_id] = view.passes.some((p) => initialAnswers[answerKey(p, it.item_id)]?.needs_context);
    return out;
  });
  const [attribution, setAttribution] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [safety, setSafety] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [pending, start] = useTransition();
  const [finishing, startFinish] = useTransition();
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const item = view.items[index];
  const total = view.items.length;
  const multi = view.passes.length > 1;
  const isComplete = (it: (typeof view.items)[number], a: AnswerMap) => view.passes.every((p) => answerKey(p, it.item_id) in a);
  const answeredItems = useMemo(() => view.items.filter((it) => isComplete(it, answers)).length, [view, answers]); // eslint-disable-line react-hooks/exhaustive-deps
  const allAnswered = answeredItems === total;
  const minutesLeft = Math.max(1, Math.ceil(((total - answeredItems) * SECONDS_PER_ITEM) / 60));
  const needsContext = contextFlags[item.item_id] ?? false;
  const singleScale = !multi ? item.scales[view.passes[0]] : null;

  /** Move to another item with the leave/arrive animation, or instantly under reduced motion. */
  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === index || busy.current) return;
    setCelebrate(false);
    if (reduced) {
      setIndex(next);
      setStatus({ kind: "idle" });
      return;
    }
    busy.current = true;
    setPhase("leaving");
    later(() => {
      setIndex(next);
      setStatus({ kind: "idle" });
      setPhase("arriving");
      later(() => {
        setPhase("idle");
        busy.current = false;
      }, ARRIVE_MS);
    }, LEAVE_MS);
  };

  const save = (pass: string, value: number) => {
    const nextAnswers = { ...answers, [answerKey(pass, item.item_id)]: { value, needs_context: needsContext } };
    setAnswers(nextAnswers);
    setStatus({ kind: "saving" });
    const completed = isComplete(item, nextAnswers);
    const last = index === total - 1;
    start(async () => {
      const r = await saveAnswer({ instrumentKey: view.key, itemId: item.item_id, pass, value, needsContext });
      if (!r.ok) {
        setStatus({ kind: "error", text: r.error });
        return;
      }
      setStatus({ kind: "saved" });
      if (r.safetyFlag && r.safetyMessage) {
        setSafety(r.safetyMessage);
        return; // the safety screen holds the page; the person continues from it
      }
      if (!completed) return;
      if (last) {
        if (view.items.every((it) => isComplete(it, nextAnswers))) later(() => setCelebrate(true), reduced ? 120 : SETTLE_MS);
        return;
      }
      later(() => go(index + 1), reduced ? 120 : SETTLE_MS);
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

  // Number keys answer a single-scale item.
  useEffect(() => {
    if (!singleScale || celebrate || safety) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const n = Number(e.key);
      if (n < singleScale.min || n > singleScale.max || busy.current) return;
      e.preventDefault();
      save(view.passes[0], n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound each render so it sees the current item and answers

  const polarizationGap = (() => {
    if (view.key !== "polarization" || view.attribution_gap_at_or_above === null) return null;
    const a = answers[answerKey("self_alone", item.item_id)]?.value;
    const b = answers[answerKey("self_with_partner", item.item_id)]?.value;
    const c = answers[answerKey("partner_becomes", item.item_id)]?.value;
    if (a === undefined || b === undefined || c === undefined) return null;
    return Math.abs(a - b) >= view.attribution_gap_at_or_above ? { a, b } : null;
  })();

  const anim = phase === "leaving" ? "anim-leave" : phase === "arriving" ? "anim-arrive" : "";

  return (
    <div className="space-y-4">
      {safety ? <SafetyScreen message={safety} onContinue={() => setSafety(null)} /> : null}
      <div>
        <Link href="/instruments" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          All questionnaires
        </Link>
        <h1 className="mt-2 text-2xl sm:text-[28px]">
          {view.name}
          {view.unvalidated ? <UnvalidatedLabel /> : null}
        </h1>
        <p className="mt-1 text-sm text-muted">Source: {view.source_citation}</p>
        {view.mental_health ? <p className="mt-1 text-sm text-muted">Your answers here are encrypted and private to you unless you choose to share the score.</p> : null}
      </div>

      <ProgressBar value={answeredItems} max={total} label={`${answeredItems} of ${total} answered`} detail={allAnswered ? "Done" : `about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} left`} />

      {celebrate ? (
        <Card as="article" eyebrow={view.name} className="anim-arrive">
          <h2 className="text-[26px]">That&rsquo;s the {view.name} done.</h2>
          <p className="reading mt-2 text-[17px] text-muted">
            {total} answers. Finishing marks it complete for you; nothing is compared until you have both finished everything.
          </p>
          {status.kind === "error" ? (
            <div className="mt-3">
              <Notice tone="warn">{status.text}</Notice>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              disabled={finishing || pending}
              aria-busy={finishing}
              onClick={() =>
                startFinish(async () => {
                  const r = await finishInstrument({ instrumentKey: view.key });
                  if (r && !r.ok) setStatus({ kind: "error", text: r.error });
                  else router.push("/instruments");
                })
              }
            >
              {finishing ? "Finishing…" : "Finish this questionnaire"}
            </Button>
            <Button variant="secondary" onClick={() => setCelebrate(false)}>
              Look over my answers
            </Button>
          </div>
        </Card>
      ) : (
        <div className={anim}>
          <Card as="article" key={item.item_id} eyebrow={`Item ${index + 1} of ${total}${item.group ? ` · ${GROUP_TITLES[item.group] ?? item.group}` : ""}`}>
            {item.placeholder ? <Notice tone="warn">Item text not yet populated by the owner. The bracketed descriptor stands in for the official wording.</Notice> : null}
            <h2 className="reading text-[24px] leading-snug">{item.text}</h2>

            {view.passes.map((pass) => (
              <ScaleField
                key={pass}
                name={`${item.item_id}-${pass}`}
                legend={multi ? (view.pass_prompts[pass] ?? pass) : <span className="sr-only">{item.text}</span>}
                scale={item.scales[pass]}
                value={answers[answerKey(pass, item.item_id)]?.value ?? null}
                onChange={(v) => save(pass, v)}
                settle={!reduced}
              />
            ))}

            {polarizationGap && view.attribution_prompt ? (
              <div className="mt-4 rounded-control border border-rule p-3">
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
                  size="sm"
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

            <label className="mt-4 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={needsContext} onChange={toggleContext} /> This one needs context
            </label>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rule/70 pt-4">
              <span role="status" aria-live="polite" className="text-sm text-muted">
                {status.kind === "saving" ? "Saving…" : status.kind === "saved" ? (status.text ?? "Saved") : status.kind === "error" ? status.text : singleScale && singleScale.max <= 9 ? `Keys ${singleScale.min} to ${singleScale.max} work too` : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
                  Back
                </Button>
                <Button variant="secondary" size="sm" onClick={() => go(index + 1)} disabled={index >= total - 1}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
          {!multi ? <p className="mt-2 text-xs text-muted">Answering moves you on. Unsure? Next leaves it for later.</p> : null}
        </div>
      )}

      {allAnswered && !celebrate ? (
        <Card dashed as="div">
          <p className="reading text-[17px]">Every item is answered.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => setCelebrate(true)}>Finish this questionnaire</Button>
            <LinkButton href="/instruments" variant="secondary">
              All questionnaires
            </LinkButton>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
