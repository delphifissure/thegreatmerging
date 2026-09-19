"use client";

import { useTransition } from "react";
import { removeSample } from "./actions";

export function RemoveSample({ sampleId }: { sampleId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await removeSample({ sampleId })))} className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
