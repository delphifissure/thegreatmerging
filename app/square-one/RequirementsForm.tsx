"use client";

import { useActionState } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { idle } from "@/app/_lib/actions";
import { saveRequirements } from "./actions";

export function RequirementsForm({ initial, count }: { initial: string[]; count: number }) {
  const [state, action, pending] = useActionState(saveRequirements, idle);
  return (
    <form action={action} className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <label htmlFor={`req_${i}`} className="block text-sm">
            Requirement {i + 1}
          </label>
          <input id={`req_${i}`} name={`req_${i}`} type="text" maxLength={300} defaultValue={initial[i] ?? ""} className="w-full" />
        </div>
      ))}
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : state.message ? <Notice>{state.message}</Notice> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save requirements"}
      </Button>
    </form>
  );
}
