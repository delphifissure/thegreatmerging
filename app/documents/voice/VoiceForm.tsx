"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { keepOnly, PASTED_REGISTERS, REGISTER_HINTS, REGISTER_TITLES, splitSpeakers } from "@/lib/biographer/voice";
import { addSample } from "./actions";

type Pasted = (typeof PASTED_REGISTERS)[number];

/**
 * Paste something you wrote. If it is a conversation, the other person's side is dropped here, in
 * the browser, before anything is sent: their words are theirs.
 */
export function VoiceForm() {
  const [register, setRegister] = useState<Pasted>("everyday");
  const [text, setText] = useState("");
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [allMine, setAllMine] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const { speakers, format } = useMemo(() => splitSpeakers(text), [text]);
  const conversation = speakers.length >= 2 && !(allMine && format === "names");
  const mine = conversation && speaker && speakers.includes(speaker) ? keepOnly(text, speaker) : null;
  const kept = conversation ? mine : text.trim();
  const keptWords = kept ? kept.split(/\s+/).filter(Boolean).length : 0;

  const save = () =>
    start(async () => {
      setNote(null);
      if (!kept) return;
      const r = await addSample({ register, text: kept, allMine: allMine && format === "names" });
      setNote(r.ok ? { ok: true, text: r.message ?? "Kept." } : { ok: false, text: r.error });
      if (r.ok) {
        setText("");
        setSpeaker(null);
        setAllMine(false);
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="rounded-card border border-accent/50 bg-surface p-5 shadow-card"
    >
      <fieldset>
        <legend className="reading text-[19px]">What kind of writing is this?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PASTED_REGISTERS.map((r) => (
            <label key={r} className={`cursor-pointer rounded-control border p-3 transition-colors ${register === r ? "border-accent bg-tint" : "border-rule hover:border-accent/60"}`}>
              <input type="radio" name="register" value={r} checked={register === r} onChange={() => setRegister(r)} className="sr-only" />
              <span className="block font-medium">{REGISTER_TITLES[r]}</span>
              <span className="mt-0.5 block text-sm text-muted">{REGISTER_HINTS[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="voice-text" className="reading mt-5 block text-[19px]">
        Paste it here
      </label>
      <p className="mt-1 text-sm text-muted">A chat export is fine. Only your own words are kept.</p>
      <textarea id="voice-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} className="mt-2 w-full" disabled={pending} />

      {conversation ? (
        <fieldset className="mt-3 rounded-control border border-rule bg-paper p-3">
          <legend className="px-1 text-sm font-medium">This looks like a conversation. Which one is you?</legend>
          <div className="flex flex-wrap gap-2">
            {speakers.map((s) => (
              <label key={s} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${speaker === s ? "border-accent bg-accent text-accent-ink" : "border-rule bg-surface hover:border-accent/60"}`}>
                <input type="radio" name="speaker" value={s} checked={speaker === s} onChange={() => setSpeaker(s)} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
          {format === "names" ? (
            <button type="button" className="mt-2 text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink" onClick={() => setAllMine(true)}>
              It isn&rsquo;t a conversation: I wrote all of it
            </button>
          ) : null}
          <p className="mt-2 text-sm text-muted">
            {mine ? `${keptWords} of your words will be kept. Everything the other person wrote is dropped here, in your browser, and is never sent or stored.` : "The other person's messages are dropped in your browser before anything is sent. Their words are theirs."}
          </p>
        </fieldset>
      ) : null}

      {note ? (
        <div className="mt-3">
          <Notice tone={note.ok ? "good" : "warn"}>
            <span className="whitespace-pre-line">{note.text}</span>
          </Notice>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !kept || keptWords < 5} aria-busy={pending}>
          {pending ? "Keeping…" : "Keep this sample"}
        </Button>
        {kept && keptWords < 5 ? <span className="text-sm text-muted">A few sentences or a handful of messages is enough.</span> : null}
      </div>
    </form>
  );
}
