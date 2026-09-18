"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { sendMessage } from "../actions";

/** The current question, in the reading face, with its honest reason a tap away. */
export function BiographerForm({ threadId, question, why, safety }: { threadId: string; question: string; why: string | null; safety: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendMessage({ threadId, text: text.trim() });
      if (!r.ok) setError(r.error);
      else setText("");
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) send();
      }}
      className={`anim-arrive rounded-card border bg-surface p-5 shadow-card ${safety ? "border-warn" : "border-accent/50"}`}
      aria-labelledby="current-question"
    >
      <p className="eyebrow mb-2">Biographer</p>
      <p id="current-question" className="reading whitespace-pre-line text-[20px] leading-snug">
        {question}
      </p>
      {why && !safety ? (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-accent">Why this is being asked</summary>
          <p className="reading mt-2 max-w-prose text-[15px]">{why} The question was written by the app. It decides nothing about you, and nobody else sees this conversation.</p>
        </details>
      ) : null}
      <label htmlFor="biographer-answer" className="sr-only">
        Your answer
      </label>
      <textarea id="biographer-answer" rows={6} value={text} onChange={(e) => setText(e.target.value)} className="mt-4 w-full" placeholder="Take your time. A specific moment helps more than a general rule." disabled={pending} />
      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !text.trim()} aria-busy={pending}>
          {pending ? "Thinking…" : "Send"}
        </Button>
        {pending ? <span className="text-sm text-muted">Reading what you wrote. This takes a few seconds.</span> : null}
      </div>
    </form>
  );
}
