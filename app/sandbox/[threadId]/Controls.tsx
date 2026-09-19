"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { advanceSandboxAction, deleteSandboxAction, extendSandboxAction } from "../actions";

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
