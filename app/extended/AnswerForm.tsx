"use client";

import { useActionState, useState } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { idle, type ActionResult } from "@/app/_lib/actions";

/** A textarea plus Save, wired to a form action. Hidden fields carry the question id (and who answers). */
export function AnswerForm({
  action,
  hidden,
  label,
  initial = "",
  submitLabel = "Save",
  keepAfterSave = false,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  label: string;
  initial?: string;
  submitLabel?: string;
  keepAfterSave?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const r = await action(prev, formData);
    if (r.ok && !keepAfterSave) setValue("");
    return r;
  }, idle);
  const id = `ans-${Object.values(hidden).join("-")}`;
  return (
    <form action={formAction} className="mt-2 space-y-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <textarea id={id} name="answer" rows={3} value={value} onChange={(e) => setValue(e.target.value)} className="w-full" />
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : state.message ? <Notice>{state.message}</Notice> : null}
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
