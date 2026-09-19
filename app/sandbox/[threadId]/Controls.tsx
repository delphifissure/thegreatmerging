"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { advanceSandboxAction, deleteSandboxAction, extendSandboxAction, saveBriefAction, writeBriefsAction } from "../actions";

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

/** Runs the conversation a turn at a time from the browser, so the page fills in as it goes. */
export function SandboxRunner({ threadId, turns, maxTurns }: { threadId: string; turns: number; maxTurns: number }) {
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(turns);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      let expected = Math.max(count, turns);
      for (let i = 0; i < 60; i++) {
        const r = await advanceSandboxAction({ threadId, expected });
        if (!r.ok) return setError(r.error);
        expected = r.turns;
        setCount(r.turns);
        if (r.done) return;
      }
    });
  return (
    <div className="rounded-card border border-dashed border-rule bg-surface p-5">
      <p className="reading text-[17px]">{turns === 0 ? "They are in the room. Nothing has been said yet." : `${turns} of ${maxTurns} turns so far.`}</p>
      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={pending} aria-busy={pending} onClick={go}>
          {pending ? `Turn ${Math.max(count, turns) + 1}…` : turns === 0 ? "Let them talk" : "Carry on"}
        </Button>
        {pending ? <span className="text-sm text-muted">Each turn takes a few seconds.</span> : null}
      </div>
    </div>
  );
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
            Give them six more turns
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
