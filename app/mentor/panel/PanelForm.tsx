"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { askPanel } from "./actions";

/** One situation, asked once. On success the action moves to the panel itself. */
export function PanelForm({ versions }: { versions: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ask = () =>
    start(async () => {
      setError(null);
      const r = await askPanel({ text: text.trim() });
      if (r && !r.ok) setError(r.error);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) ask();
      }}
      className="rounded-card border border-accent/50 bg-surface p-5 shadow-card"
    >
      <label htmlFor="panel-situation" className="reading block text-[19px]">
        Describe one situation: something that happened, or something coming up that you&rsquo;re not sure how you&rsquo;ll handle.
      </label>
      <textarea
        id="panel-situation"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-3 w-full"
        placeholder="What it is, who is involved, and what makes it hard."
        disabled={pending}
      />
      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !text.trim()} aria-busy={pending}>
          {pending ? "Asking…" : "Ask all of me"}
        </Button>
        <span className="text-sm text-muted">{pending ? `Asking ${versions} versions of you at once. This takes about twenty seconds.` : `${versions} versions of you will answer, side by side.`}</span>
      </div>
    </form>
  );
}
