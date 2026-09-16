"use client";

import { useActionState } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { idle } from "@/app/_lib/actions";
import { acceptInvite } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvite, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {!state.ok ? <Notice tone="warn">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Accepting…" : "Accept the invitation"}
      </Button>
    </form>
  );
}
