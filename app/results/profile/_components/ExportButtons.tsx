"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { requestExport } from "../actions";

export function ExportButtons({ kind }: { kind: "brief" | "plan" | "profile" }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (format: "md" | "pdf") =>
    start(async () => {
      const r = await requestExport({ kind, format });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Requested." } : { ok: false, text: r.error });
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => run("md")}>
          Export Markdown
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => run("pdf")}>
          Export PDF
        </Button>
      </div>
      {msg ? <Notice tone={msg.ok ? "info" : "warn"}>{msg.text}</Notice> : null}
    </div>
  );
}
