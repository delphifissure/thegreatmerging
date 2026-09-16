"use client";

import { useActionState } from "react";
import { Button } from "@/app/_components/Button";
import { Field, Notice } from "@/app/_components/Field";
import { idle } from "@/app/_lib/actions";
import { inviteCaregiver } from "./actions";

export function InviteCaregiverForm() {
  const [state, action, pending] = useActionState(inviteCaregiver, idle);
  return (
    <form action={action} className="space-y-3">
      <Field label="Caregiver's email" htmlFor="cg-email">
        <input id="cg-email" name="email" type="email" required className="w-full max-w-sm" />
      </Field>
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.ok && state.message ? (
        <div className="rounded border border-border p-3 text-sm">
          <p>Send this link to them yourself:</p>
          <p className="mt-1 break-all font-mono">{state.message}</p>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating link…" : "Create invitation link"}
      </Button>
    </form>
  );
}
