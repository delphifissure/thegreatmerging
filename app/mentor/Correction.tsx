"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { saveReplyCorrection } from "./actions";

/**
 * "What would you have said?" The avatar's words and the person's own, side by side, are the best
 * sample of their style there is, because the content is the same.
 */
export function Correction({ turnId, correction, open = false }: { turnId: string; correction: string | null; open?: boolean }) {
  const [text, setText] = useState(correction ?? "");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (value: string) =>
    start(async () => {
      setNote(null);
      const r = await saveReplyCorrection({ turnId, text: value });
      setNote(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
      if (r.ok && !value) setText("");
    });

  return (
    <details className="mt-3 text-sm" open={open || !!correction}>
      <summary className="cursor-pointer font-medium text-accent">{correction ? "How you would have put it" : "Put it in your own words"}</summary>
      <label htmlFor={`correction-${turnId}`} className="mt-2 block text-muted">
        What would you have said? Same point, your wording. Your avatars learn how you write from this. It is never treated as a fact about you.
      </label>
      <textarea id={`correction-${turnId}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} className="mt-2 w-full" disabled={pending} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" disabled={pending || !text.trim() || text.trim() === (correction ?? "")} aria-busy={pending} onClick={() => save(text.trim())}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {correction ? (
          <button type="button" className="text-muted underline decoration-rule underline-offset-4 hover:text-ink" disabled={pending} onClick={() => save("")}>
            Remove
          </button>
        ) : null}
        {note ? <span className={note.ok ? "text-muted" : "reading whitespace-pre-line text-ink"}>{note.text}</span> : null}
      </div>
    </details>
  );
}
