"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { startInterpretation } from "./actions";

export function StartButton({ label }: { label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await startInterpretation();
            setMsg(r.ok ? { ok: true, text: r.message ?? "Started." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Starting…" : label}
      </Button>
      {msg ? <Notice tone={msg.ok ? "info" : "warn"}>{msg.text}</Notice> : null}
    </div>
  );
}
