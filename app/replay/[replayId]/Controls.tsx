"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import type { ActionResult } from "@/app/_lib/actions";
import { ENDING_WORDS, ENDINGS, MOVE_I, MOVE_THEY, REMEMBERED_MOVES, type Ending } from "@/lib/replay/moves";
import { advanceReplayAction, allowAllLinesAction, rateReplayTurnAction, respondAction, saveAccountAction, saveVerdictAction, withdrawAction } from "../actions";

const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`;

function useAction() {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if (!r.ok) setNote({ ok: false, text: r.error });
      else if (r.message) setNote({ ok: true, text: r.message });
    });
  return { note, pending, run };
}

const Note = ({ note }: { note: { ok: boolean; text: string } | null }) =>
  note ? (
    <div className="mt-3">
      <Notice tone={note.ok ? "good" : "warn"}>
        <span className="whitespace-pre-line">{note.text}</span>
      </Notice>
    </div>
  ) : null;

export function Respond({ replayId }: { replayId: string }) {
  const { note, pending, run } = useAction();
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => run(() => respondAction({ replayId, accept: true }))}>
          Yes, replay this one
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => respondAction({ replayId, accept: false }))}>
          No, not this one
        </Button>
      </div>
      <Note note={note} />
    </div>
  );
}

export function Withdraw({ replayId }: { replayId: string }) {
  const { note, pending, run } = useAction();
  const [sure, setSure] = useState(false);
  return (
    <div className="text-sm text-muted">
      {sure ? (
        <span className="flex flex-wrap items-center gap-3">
          This deletes the replay for both of you, including what both avatars said.
          <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => withdrawAction({ replayId }))}>
            Withdraw and delete
          </Button>
          <button type="button" className="underline decoration-rule underline-offset-4" onClick={() => setSure(false)}>
            Keep it
          </button>
        </span>
      ) : (
        <button type="button" className="underline decoration-rule underline-offset-4 hover:text-ink" onClick={() => setSure(true)}>
          Withdraw from this replay
        </button>
      )}
      <Note note={note} />
    </div>
  );
}

export function AllowAllLines() {
  const { note, pending, run } = useAction();
  return (
    <div className="mt-3">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => allowAllLinesAction())}>
        Let my rehearsal avatar act on all my ratified lines
      </Button>
      <p className="mt-1.5 text-sm text-muted">It will act on them and never say them. You can set any line back to private in your documents, one at a time.</p>
      <Note note={note} />
    </div>
  );
}

function MoveTicks({ legend, words, value, onChange, disabled }: { legend: string; words: Record<string, string>; value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  return (
    <fieldset className="mt-5">
      <legend className="reading text-[18px]">{legend}</legend>
      <p className="text-sm text-muted">Tick everything that fits. Order doesn&rsquo;t matter.</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {REMEMBERED_MOVES.map((m) => {
          const on = value.includes(m);
          return (
            <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-[15px] ${on ? "border-accent bg-tint" : "border-rule hover:border-accent/60"}`}>
              <input type="checkbox" checked={on} disabled={disabled} onChange={() => onChange(on ? value.filter((x) => x !== m) : [...value, m])} />
              {words[m]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One person's private memory. It is the answer the replay is tested against, so no avatar ever sees what they did. */
export function AccountForm({ replayId, partnerName, initial }: { replayId: string; partnerName: string; initial: { stateBefore: string; myMoves: string[]; theirMoves: string[]; ending: Ending; notes: string } | null }) {
  const [stateBefore, setStateBefore] = useState(initial?.stateBefore ?? "");
  const [myMoves, setMyMoves] = useState<string[]>(initial?.myMoves ?? []);
  const [theirMoves, setTheirMoves] = useState<string[]>(initial?.theirMoves ?? []);
  const [ending, setEnding] = useState<Ending | "">(initial?.ending ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const { note, pending, run } = useAction();
  const ready = stateBefore.trim().length >= 3 && myMoves.length > 0 && ending !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && ending) run(() => saveAccountAction({ replayId, stateBefore: stateBefore.trim(), myMoves, theirMoves, ending, notes: notes.trim() }));
      }}
      className="rounded-card border border-accent/50 bg-surface p-5 shadow-card"
    >
      <p className="eyebrow mb-2">Your account · private to you</p>
      <label htmlFor="state-before" className="reading block text-[18px]">
        What state were you in when it started?
      </label>
      <p className="text-sm text-muted">Tired, rushed, already annoyed about something else, fine. This is the only part your own avatar is told.</p>
      <textarea id="state-before" rows={2} value={stateBefore} onChange={(e) => setStateBefore(e.target.value)} className="mt-2 w-full" disabled={pending} />

      <MoveTicks legend="What did you do, as it went on?" words={MOVE_I} value={myMoves} onChange={setMyMoves} disabled={pending} />
      <MoveTicks legend={`What did ${partnerName} do, as you remember it?`} words={Object.fromEntries(Object.entries(MOVE_THEY).map(([k, v]) => [k, `${partnerName} ${v}`]))} value={theirMoves} onChange={setTheirMoves} disabled={pending} />

      <fieldset className="mt-5">
        <legend className="reading text-[18px]">How did it end?</legend>
        <div className="mt-2 grid gap-1.5">
          {ENDINGS.map((e) => (
            <label key={e} className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-[15px] ${ending === e ? "border-accent bg-tint" : "border-rule hover:border-accent/60"}`}>
              <input type="radio" name="ending" checked={ending === e} disabled={pending} onChange={() => setEnding(e)} />
              {ENDING_WORDS[e]}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="account-notes" className="reading mt-5 block text-[18px]">
        Anything else you remember <span className="text-sm text-muted">(optional, and only ever for you)</span>
      </label>
      <textarea id="account-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 w-full" disabled={pending} />

      <Note note={note} />
      <div className="mt-4">
        <Button type="submit" disabled={pending || !ready} aria-busy={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Save my account"}
        </Button>
      </div>
    </form>
  );
}

/** Runs the replay a turn at a time from the browser, so the page fills in as it goes and either person can pick it up. */
export function Runner({ replayId, turns, started }: { replayId: string; turns: number; started: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(turns);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      let expected = Math.max(count, turns);
      for (let i = 0; i < 40; i++) {
        const r = await advanceReplayAction({ replayId, expected });
        if (!r.ok) return setError(r.error);
        expected = r.turns;
        setCount(r.turns);
        if (r.done) return;
      }
    });
  return (
    <div className="rounded-card border border-dashed border-rule bg-surface p-5">
      <p className="reading text-[17px]">{started ? "The replay stopped part way. It carries on from where it got to." : "Both accounts are in. Your avatars can replay it now, a turn at a time."}</p>
      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={pending} aria-busy={pending} onClick={go}>
          {pending ? `Turn ${count + 1}…` : started ? "Carry on" : "Run the replay"}
        </Button>
        {pending ? <span className="text-sm text-muted">Each turn takes a few seconds. You can watch it fill in.</span> : null}
      </div>
    </div>
  );
}

export function TurnVerdict({ replayId, seq, rating }: { replayId: string; seq: number; rating: "like_me" | "not_like_me" | null }) {
  const [value, setValue] = useState(rating);
  const [pending, start] = useTransition();
  const rate = (r: "like_me" | "not_like_me") =>
    start(async () => {
      setValue(r);
      const res = await rateReplayTurnAction({ replayId, seq, rating: r });
      if (!res.ok) setValue(rating);
    });
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Did you do something like this?">
      <button type="button" disabled={pending} aria-pressed={value === "like_me"} onClick={() => rate("like_me")} className={pill(value === "like_me")}>
        I did something like this
      </button>
      <button type="button" disabled={pending} aria-pressed={value === "not_like_me"} onClick={() => rate("not_like_me")} className={pill(value === "not_like_me")}>
        I didn&rsquo;t do this
      </button>
    </div>
  );
}

export function OverallVerdict({ replayId, verdict }: { replayId: string; verdict: "yes" | "partly" | "no" | null }) {
  const [value, setValue] = useState(verdict);
  const { note, pending, run } = useAction();
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Did the replay have the shape of what happened?">
        {(
          [
            ["yes", "Yes, that's the shape of it"],
            ["partly", "Partly"],
            ["no", "No, that isn't how it went"],
          ] as const
        ).map(([v, text]) => (
          <button
            key={v}
            type="button"
            disabled={pending}
            aria-pressed={value === v}
            className={pill(value === v)}
            onClick={() => {
              setValue(v);
              run(() => saveVerdictAction({ replayId, verdict: v }));
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <Note note={note} />
    </div>
  );
}
