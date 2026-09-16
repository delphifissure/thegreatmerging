"use client";

import { useActionState, useState } from "react";
import { Button } from "@/app/_components/Button";
import { Field, Notice } from "@/app/_components/Field";
import { idle } from "@/app/_lib/actions";
import { createShare } from "../actions";

export function ShareForm() {
  const [state, action, pending] = useActionState(createShare, idle);
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const link = state.ok ? state.message : undefined;
  return (
    <form action={action} className="space-y-3">
      <Field label="Therapist's email" htmlFor="share-email" hint="Used to label the share; the link itself is shown to you once, below, for you to pass on.">
        <input id="share-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full max-w-sm" />
      </Field>
      {!confirming ? (
        <Button type="button" variant="secondary" onClick={() => email.trim() && setConfirming(true)}>
          Create a share link
        </Button>
      ) : (
        <div role="dialog" aria-labelledby="share-confirm" className="rounded border border-warn-border bg-warn-bg p-3 text-sm">
          <p id="share-confirm" className="font-medium">
            Share your individual profile with {email.trim()}?
          </p>
          <p className="mt-1">The link works for 72 hours. Every access is logged. You can revoke it any time.</p>
          <input type="hidden" name="confirmed" value="yes" />
          <div className="mt-2 flex gap-2">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Creating…" : "Yes, create the link"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : null}
      {link ? (
        <div className="rounded border border-border p-3 text-sm">
          <p>Your share link. It is shown only this once; copy it now.</p>
          <p className="mt-1 break-all font-mono">{link}</p>
        </div>
      ) : null}
    </form>
  );
}
