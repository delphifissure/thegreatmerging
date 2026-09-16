"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/app/_components/Button";

/**
 * Full-screen resource screen shown to this user only after PHQ-9 item 9 above 0. The message
 * comes from lib/data (SAFETY_RESOURCE_MESSAGE). Never rendered for the partner.
 */
export function SafetyScreen({ message, onContinue }: { message: string; onContinue: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="safety-title" className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="max-w-prose space-y-4 rounded-lg border-2 border-warn-border bg-surface p-6">
        <h2 id="safety-title" className="text-xl font-semibold">
          Before you go on
        </h2>
        <p>{message}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            United States: call or text <strong>988</strong>, any time.
          </li>
          <li>Anywhere: your local emergency number, or a person you trust.</li>
        </ul>
        <p className="text-sm text-muted">This screen is only shown to you. Your answer is stored privately and never used in any comparison.</p>
        <Button ref={btn} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
