"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { sendMessage } from "../actions";

const chip = "rounded-full border border-rule bg-paper px-3 py-1.5 text-left text-[15px] text-ink transition-colors hover:border-accent hover:bg-tint disabled:opacity-60";

/** The current question, in the reading face, with its honest reason a tap away. */
export function BiographerForm({ threadId, question, why, safety, options, threads }: { threadId: string; question: string; why: string | null; safety: boolean; options: string[]; threads: string[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendMessage({ threadId, text: text.trim() });
      if (!r.ok) setError(r.error);
      else setText("");
    });

  /** A tap starts the answer; it never sends it. The person finishes the sentence. */
  const begin = (opening: string) => {
    setText((t) => (t.trim() ? `${t.trimEnd()} ${opening}` : opening));
    box.current?.focus();
  };

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
      {options.length > 0 && !safety ? (
        <div className="mt-4">
          <p className="text-sm text-muted">Some places to start, if one fits. Or write your own.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((o) => (
              <button key={o} type="button" className={chip} onClick={() => begin(o)} disabled={pending}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <label htmlFor="biographer-answer" className="sr-only">
        Your answer
      </label>
      <textarea
        id="biographer-answer"
        ref={box}
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-4 w-full"
        placeholder="As much or as little as you like. A specific moment helps more than a general rule."
        disabled={pending}
      />
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
      {threads.length > 0 && !safety ? (
        <div className="mt-5 border-t border-rule/70 pt-4">
          <p className="text-sm text-muted">Things you mentioned that we haven&rsquo;t got to yet. Tap one to go there instead.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {threads.map((t) => (
              <button key={t} type="button" className={chip} onClick={() => begin(`I\u2019d rather talk about this: ${t}. `)} disabled={pending}>
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
