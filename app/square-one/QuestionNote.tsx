"use client";

import { useState, useTransition } from "react";
import { saveNote } from "./actions";

/** One question: notes and the eyebrow checkbox, saved on change and on blur. */
export function QuestionNote({ index, text, listenFor, eyebrowLabel, initialNotes, initialEyebrow }: { index: number; text: string; listenFor: string; eyebrowLabel: string; initialNotes: string; initialEyebrow: boolean }) {
  const [notes, setNotes] = useState(initialNotes);
  const [eyebrow, setEyebrow] = useState(initialEyebrow);
  const [status, setStatus] = useState<string>("");
  const [, start] = useTransition();
  const persist = (n: string, e: boolean) =>
    start(async () => {
      setStatus("Saving…");
      const r = await saveNote({ questionIndex: index, notes: n, raisedEyebrow: e });
      setStatus(r.ok ? "Saved" : r.error);
    });
  return (
    <li className="py-4">
      <p className="font-medium">
        {index}. {text}
      </p>
      {listenFor ? <p className="mt-1 text-sm text-muted">{listenFor}</p> : null}
      <label htmlFor={`sq-notes-${index}`} className="mt-2 block text-sm">
        Notes
      </label>
      <textarea id={`sq-notes-${index}`} rows={2} className="w-full" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== initialNotes && persist(notes, eyebrow)} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={eyebrow}
            onChange={(e) => {
              setEyebrow(e.target.checked);
              persist(notes, e.target.checked);
            }}
          />{" "}
          {eyebrowLabel}
        </label>
        <span role="status" className="text-xs text-muted">
          {status}
        </span>
      </div>
    </li>
  );
}
