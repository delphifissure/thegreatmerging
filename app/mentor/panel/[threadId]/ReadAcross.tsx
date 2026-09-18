"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { readPanel } from "../actions";

/** Asks the app to read across the versions, once the person has said which of them they recognize. */
export function ReadAcross({ threadId, rated, needed }: { threadId: string; rated: number; needed: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = rated >= needed;
  return (
    <div className="rounded-card border border-dashed border-rule bg-surface p-5">
      <p className="reading text-[17px]">{ready ? "When you're ready, the app can read across them: what held in every version, and what changed with the version." : `Say which of these you recognize first. ${needed - rated} more to go.`}</p>
      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!ready || pending}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await readPanel({ threadId });
              if (!r.ok) setError(r.error);
            })
          }
        >
          {pending ? "Reading…" : "Read across them"}
        </Button>
        {pending ? <span className="text-sm text-muted">This takes a few seconds.</span> : null}
      </div>
    </div>
  );
}
