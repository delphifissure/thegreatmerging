"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { requestBrief } from "@/app/color/[domain]/actions";

export function RequestBrief() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestBrief();
            setMsg(r.ok ? r.message ?? "Requested." : r.error);
          })
        }
      >
        Ask for the brief again
      </Button>
      {msg ? <Notice>{msg}</Notice> : null}
    </div>
  );
}
