"use client";

import { useActionState } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { idle } from "@/app/_lib/actions";
import { completeRevisitAction } from "./actions";

const OPTIONS = [
  { value: "still_true", label: "Still true" },
  { value: "changed", label: "It has changed" },
  { value: "removed", label: "Remove it from the plan" },
] as const;

export function RevisitForm({ revisitId }: { revisitId: string }) {
  const [state, action, pending] = useActionState(completeRevisitAction, idle);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="revisitId" value={revisitId} />
      <fieldset>
        <legend className="font-medium">Still true?</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded border border-border px-3 py-1.5 has-[:checked]:border-accent has-[:checked]:bg-bar-track">
              <input type="radio" name="outcome" value={o.value} required /> {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`notes-${revisitId}`} className="block text-sm font-medium">
        Notes (optional)
      </label>
      <textarea id={`notes-${revisitId}`} name="notes" rows={2} className="w-full" />
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Record"}
      </Button>
    </form>
  );
}
