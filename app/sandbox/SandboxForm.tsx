"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import type { Scenario } from "@/lib/sandbox/scenario";
import { createSandboxAction, generatePersonasAction } from "./actions";

type Draft = { aName: string; aNotes: string; bName: string; bNotes: string; shared: string; situation: string; firstSpeaker: "a" | "b"; openingLine: string; maxTurns: number };
const EMPTY: Draft = { aName: "", aNotes: "", bName: "", bNotes: "", shared: "", situation: "", firstSpeaker: "a", openingLine: "", maxTurns: 12 };
const fromScenario = (s: Scenario): Draft => ({ aName: s.a.name, aNotes: s.a.notes, bName: s.b.name, bNotes: s.b.notes, shared: s.shared, situation: s.situation, firstSpeaker: s.firstSpeaker, openingLine: s.openingLine, maxTurns: s.maxTurns });

/** Write two people, or have them written, then put them in a situation. Everything stays editable until the conversation starts. */
export function SandboxForm({ initial }: { initial: Scenario | null }) {
  const [d, setD] = useState<Draft>(initial ? fromScenario(initial) : EMPTY);
  const [seed, setSeed] = useState("");
  const [situations, setSituations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerate] = useTransition();
  const [starting, startCreate] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const busy = generating || starting;
  const ready = d.aName.trim() && d.bName.trim() && d.aNotes.trim().length >= 40 && d.bNotes.trim().length >= 40 && d.shared.trim().length >= 20 && d.situation.trim().length >= 10;

  const generate = () =>
    startGenerate(async () => {
      setError(null);
      const r = await generatePersonasAction({ seed: seed.trim(), nameA: d.aName.trim() || undefined, nameB: d.bName.trim() || undefined });
      if (!r.ok) return setError(r.error);
      setD((x) => ({ ...x, aName: r.personas.a_name, aNotes: r.personas.a_notes, bName: r.personas.b_name, bNotes: r.personas.b_notes, shared: r.personas.shared_history, situation: x.situation || r.personas.situations[0] || "" }));
      setSituations(r.personas.situations);
    });

  const create = () =>
    startCreate(async () => {
      setError(null);
      const r = await createSandboxAction({ a: { name: d.aName, notes: d.aNotes }, b: { name: d.bName, notes: d.bNotes }, shared: d.shared, situation: d.situation, firstSpeaker: d.firstSpeaker, openingLine: d.openingLine, maxTurns: d.maxTurns });
      if (r && !r.ok) setError(r.error);
    });

  const field = "mt-1 w-full";
  return (
    <div className="space-y-5">
      <div className="rounded-card border border-dashed border-rule bg-surface p-5">
        <label htmlFor="seed" className="reading block text-[19px]">
          Have two people written for you
        </label>
        <p className="mt-1 text-sm text-muted">A few words is enough: &ldquo;together nine years, she&rsquo;s a nurse on nights, he hides purchases, they never talk about his mother.&rdquo; Leave it empty for a surprise. Names you have already typed below are kept. Everything it writes lands in the boxes below, for you to change.</p>
        <textarea id="seed" rows={2} value={seed} onChange={(e) => setSeed(e.target.value)} className="mt-2 w-full" disabled={busy} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={busy} aria-busy={generating} onClick={generate}>
            {generating ? "Writing them…" : d.aNotes || d.bNotes ? "Write them again" : "Write them"}
          </Button>
          {generating ? <span className="text-sm text-muted">Two life histories take about half a minute.</span> : null}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) create();
        }}
        className="space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(["a", "b"] as const).map((side) => (
            <fieldset key={side} className="rounded-card border border-rule bg-surface p-5 shadow-card">
              <legend className="eyebrow px-1">{side === "a" ? "The first person" : "The second person"}</legend>
              <label htmlFor={`${side}-name`} className="block text-sm font-medium">
                Name
              </label>
              <input id={`${side}-name`} type="text" maxLength={40} value={side === "a" ? d.aName : d.bName} onChange={(e) => set(side === "a" ? "aName" : "bName", e.target.value)} className={field} disabled={busy} />
              <label htmlFor={`${side}-notes`} className="mt-3 block text-sm font-medium">
                Their history, and how they are
              </label>
              <p className="text-sm text-muted">What a therapist would hold in their notes. Only this avatar is given it.</p>
              <textarea id={`${side}-notes`} rows={14} value={side === "a" ? d.aNotes : d.bNotes} onChange={(e) => set(side === "a" ? "aNotes" : "bNotes", e.target.value)} className={`${field} text-[15px]`} disabled={busy} />
            </fieldset>
          ))}
        </div>

        <div className="rounded-card border border-rule bg-surface p-5 shadow-card">
          <label htmlFor="shared" className="reading block text-[19px]">
            The life they share
          </label>
          <p className="text-sm text-muted">How they met, how the days go, what keeps coming up between them. Both avatars are given this.</p>
          <textarea id="shared" rows={7} value={d.shared} onChange={(e) => set("shared", e.target.value)} className={`${field} text-[15px]`} disabled={busy} />
        </div>

        <div className="rounded-card border border-accent/50 bg-surface p-5 shadow-card">
          <label htmlFor="situation" className="reading block text-[19px]">
            The situation
          </label>
          <p className="text-sm text-muted">What is happening, up to the moment before someone speaks.</p>
          <textarea id="situation" rows={3} value={d.situation} onChange={(e) => set("situation", e.target.value)} className={field} disabled={busy} />
          {situations.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {situations.map((s) => (
                <button key={s} type="button" onClick={() => set("situation", s)} className="rounded-control border border-rule bg-paper px-3 py-2 text-left text-[15px] hover:border-accent hover:bg-tint" disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr_auto]">
            <fieldset>
              <legend className="text-sm font-medium">Who speaks first</legend>
              <div className="mt-1 flex gap-2">
                {(["a", "b"] as const).map((side) => (
                  <label key={side} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${d.firstSpeaker === side ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`}>
                    <input type="radio" name="first" checked={d.firstSpeaker === side} onChange={() => set("firstSpeaker", side)} className="sr-only" />
                    {(side === "a" ? d.aName : d.bName).trim() || (side === "a" ? "The first" : "The second")}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="opening" className="block text-sm font-medium">
                Their first line <span className="font-normal text-muted">(optional; otherwise they choose it)</span>
              </label>
              <input id="opening" type="text" maxLength={300} value={d.openingLine} onChange={(e) => set("openingLine", e.target.value)} className={field} disabled={busy} />
            </div>
            <div>
              <label htmlFor="max-turns" className="block text-sm font-medium">
                Turns
              </label>
              <select id="max-turns" value={d.maxTurns} onChange={(e) => set("maxTurns", Number(e.target.value))} className="mt-1" disabled={busy}>
                {[6, 8, 12, 16, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error ? <Notice tone="warn">{error}</Notice> : null}
        <Button type="submit" disabled={busy || !ready} aria-busy={starting}>
          {starting ? "Setting it up…" : "Put them in the room"}
        </Button>
      </form>
    </div>
  );
}
