"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { requestProbes } from "./actions";

export function RetryProbes({ sessionId }: { sessionId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mt-2 space-y-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestProbes({ sessionId });
            setMsg(r.ok ? { ok: true, text: r.message ?? "Requested." } : { ok: false, text: r.error });
          })
        }
      >
        Request follow-ups again
      </Button>
      {msg ? <Notice tone={msg.ok ? "info" : "warn"}>{msg.text}</Notice> : null}
    </div>
  );
}
