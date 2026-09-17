"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Field, Notice } from "@/app/_components/Field";
import { Toggle } from "@/app/_components/Toggle";
import { idle } from "@/app/_lib/actions";
import { createCoupleAction, createInviteAction, updateHasChildrenAction, updateNameAction } from "../actions";

export function CreateCoupleForm() {
  const [state, action, pending] = useActionState(createCoupleAction, idle);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="has_children" /> There are children in the household
      </label>
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.ok && state.message ? <Notice>{state.message}</Notice> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Starting…" : "Start together"}
      </Button>
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(createInviteAction, idle);
  const [copied, setCopied] = useState(false);
  const link = state.ok ? state.message : undefined;
  return (
    <form action={action} className="space-y-3">
      <Field label="Partner's email" htmlFor="invite-email">
        <input id="invite-email" name="email" type="email" required className="w-full max-w-sm" />
      </Field>
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : null}
      {link ? (
        <div className="rounded border border-border p-3 text-sm">
          <p>Send this link to your partner (it is not emailed automatically):</p>
          <p className="mt-1 break-all font-mono">{link}</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating link…" : "Create invitation link"}
      </Button>
    </form>
  );
}

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateNameAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Your display name" htmlFor="display_name">
        <input id="display_name" name="display_name" type="text" defaultValue={current} required maxLength={80} />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save name"}
      </Button>
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : state.message ? <Notice>{state.message}</Notice> : null}
    </form>
  );
}

export function HasChildrenSwitch({ value }: { value: boolean }) {
  const [on, setOn] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id="has-children-label" className="text-[15px]">
        Children in the household
      </span>
      <Toggle
        checked={on}
        disabled={pending}
        aria-labelledby="has-children-label"
        onChange={(next) => {
          setOn(next);
          start(async () => {
            const r = await updateHasChildrenAction({ has_children: next });
            if (!r.ok) {
              setOn(!next);
              setError(r.error);
            } else setError(null);
          });
        }}
      />
      {error ? <Notice tone="warn">{error}</Notice> : null}
    </div>
  );
}
