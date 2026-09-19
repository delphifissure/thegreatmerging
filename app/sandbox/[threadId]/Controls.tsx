"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { advanceSandboxAction, deleteSandboxAction, extendSandboxAction, saveBriefAction, writeBriefsAction, type LiveTurn } from "../actions";
import { TurnBubble } from "./TurnBubble";

/** Step one: have each person's brief written to them. */
export function WriteBriefs({ threadId, again = false }: { threadId: string; again?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      const r = await writeBriefsAction({ threadId });
      if (!r.ok) setError(r.error);
    });
  if (again) {
    return (
      <span className="text-sm">
        <button type="button" disabled={pending} onClick={go} className="text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          {pending ? "Writing them again…" : "Write both briefs again"}
        </button>
        {error ? <span className="ml-2 text-ink">{error}</span> : null}
      </span>
    );
  }
  return (
    <div className="rounded-card border border-accent/50 bg-surface p-5 shadow-card">
      <p className="reading text-[19px]">First, each of them gets a brief of their own.</p>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Your notes are written about them, the way a therapist would. An avatar should not read about itself from outside, so each person&rsquo;s notes, the life they share and the situation are rewritten to that person: &ldquo;You grew up above your parents&rsquo; shop&hellip; You did not know anyone was coming.&rdquo; Each brief is made without sight of the other person&rsquo;s notes. You can read and change both before anyone speaks.
      </p>
      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={pending} aria-busy={pending} onClick={go}>
          {pending ? "Writing their briefs…" : "Write their briefs"}
        </Button>
        {pending ? <span className="text-sm text-muted">About twenty seconds.</span> : null}
      </div>
    </div>
  );
}

/** One avatar's whole world. Editable until the conversation starts, read-only after. */
export function BriefBox({ threadId, side, name, brief, locked }: { threadId: string; side: "a" | "b"; name: string; brief: string; locked: boolean }) {
  const [text, setText] = useState(brief);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="eyebrow mb-1">What {name} is told</p>
      {locked ? (
        <pre className="reading max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-control border border-rule bg-paper p-3 text-[14px] leading-relaxed">{brief}</pre>
      ) : (
        <>
          <label htmlFor={`brief-${side}`} className="sr-only">
            The brief {name} is given
          </label>
          <textarea id={`brief-${side}`} rows={16} value={text} onChange={(e) => setText(e.target.value)} className="w-full text-[14px] leading-relaxed" disabled={pending} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || text.trim() === brief.trim() || text.trim().length < 40}
              onClick={() =>
                start(async () => {
                  setNote(null);
                  const r = await saveBriefAction({ threadId, side, text: text.trim() });
                  setNote(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
                })
              }
            >
              Save my changes
            </Button>
            {note ? <span className={`text-sm ${note.ok ? "text-muted" : "text-ink"}`}>{note.text}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Runs the conversation a turn at a time from the browser until one of them ends it. Each new turn
 * is shown the moment it arrives, from the action's own result: a loop inside one React transition
 * holds every page update back until the whole loop has finished, which is why nothing used to appear.
 */
export function SandboxRunner({ threadId, turns, names, next }: { threadId: string; turns: number; names: { a: string; b: string }; next: "a" | "b" }) {
  const router = useRouter();
  const [live, setLive] = useState<LiveTurn[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  // Turns the page has already been given are drawn by the page; only newer ones are drawn here.
  const fresh = live.filter((t) => t.index >= turns);
  const count = Math.max(turns, live.length ? live[live.length - 1].index + 1 : 0);

  const go = async () => {
    setRunning(true);
    setStopping(false);
    setError(null);
    stop.current = false;
    let expected = count;
    for (let i = 0; i < 200; i++) {
      const r = await advanceSandboxAction({ threadId, expected });
      if (!r.ok) {
        setError(r.error);
        break;
      }
      const turn = r.turn;
      if (turn) setLive((l) => (l.some((t) => t.index === turn.index) ? l : [...l, turn]));
      expected = r.turns;
      if (r.done || stop.current) break;
    }
    setRunning(false);
    router.refresh();
  };

  return (
    <div className="space-y-2.5">
      {fresh.length > 0 ? (
        <ol className="space-y-2.5" aria-label="The conversation, as it happens" aria-live="polite">
          {fresh.map((t, i) => (
            <TurnBubble key={t.index} turn={t} name={names[t.side]} otherName={names[t.side === "a" ? "b" : "a"]} landed={fresh[i + 1]?.impact ?? null} fresh />
          ))}
        </ol>
      ) : null}
      <div className="rounded-card border border-dashed border-rule bg-surface p-5">
        <p className="reading text-[17px]">
          {running ? `${names[nextSpeaker(live, turns, next)]} is about to speak…` : count === 0 ? "They are in the room. Nothing has been said yet." : `Paused after ${count} ${count === 1 ? "turn" : "turns"}.`}
        </p>
        {error ? (
          <div className="mt-3">
            <Notice tone="warn">{error}</Notice>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {running ? (
            <Button
              variant="secondary"
              disabled={stopping}
              onClick={() => {
                stop.current = true;
                setStopping(true);
              }}
            >
              {stopping ? "Stopping after this turn…" : "Pause"}
            </Button>
          ) : (
            <Button onClick={go}>{count === 0 ? "Let them talk" : "Carry on"}</Button>
          )}
          <span className="text-sm text-muted">{running ? "It goes on until one of them ends it. Each turn takes a few seconds." : "They keep going until one of them ends it. You can pause at any point."}</span>
        </div>
      </div>
    </div>
  );
}

/** Whose turn is being written: the other side from the newest turn that has arrived, or, before any has, whoever the page says is next. */
function nextSpeaker(live: LiveTurn[], turns: number, next: "a" | "b"): "a" | "b" {
  const last = live[live.length - 1];
  if (!last || last.index < turns - 1) return next;
  return last.side === "a" ? "b" : "a";
}

export function AfterControls({ threadId, canExtend }: { threadId: string; canExtend: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-3">
        {canExtend ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await extendSandboxAction({ threadId });
                if (!r.ok) setError(r.error);
              })
            }
          >
            Let them carry on
          </Button>
        ) : null}
        {sure ? (
          <>
            <Button variant="danger" disabled={pending} onClick={() => start(async () => void (await deleteSandboxAction({ threadId })))}>
              Delete this sandbox
            </Button>
            <button type="button" className="text-sm text-muted underline decoration-rule underline-offset-4" onClick={() => setSure(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink" onClick={() => setSure(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
