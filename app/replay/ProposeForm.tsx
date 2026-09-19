"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { proposeReplayAction } from "./actions";

/** The frame: the one part of a replay that is written for the partner to read. */
export function ProposeForm({ partnerName }: { partnerName: string }) {
  const [label, setLabel] = useState("");
  const [setting, setSetting] = useState("");
  const [firstSpeaker, setFirstSpeaker] = useState<"me" | "partner">("me");
  const [openingLine, setOpeningLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = label.trim().length >= 3 && setting.trim().length >= 3 && openingLine.trim().length >= 2;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        start(async () => {
          setError(null);
          const r = await proposeReplayAction({ label: label.trim(), setting: setting.trim(), firstSpeaker, openingLine: openingLine.trim() });
          if (r && !r.ok) setError(r.error);
        });
      }}
      className="rounded-card border border-accent/50 bg-surface p-5 shadow-card"
    >
      <p className="reading text-[19px]">Pick one argument you both remember. Not the worst one. One that still puzzles you a little.</p>
      <p className="mt-1 text-sm text-muted">{partnerName} will read everything in this box, so write it the way you would say it to them. Name what it was about, not who was at fault.</p>

      <label htmlFor="replay-label" className="mt-4 block text-sm font-medium">
        What it was about
      </label>
      <input id="replay-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} className="mt-1 w-full" placeholder="The card statement in March" disabled={pending} />

      <label htmlFor="replay-setting" className="mt-4 block text-sm font-medium">
        Where and when
      </label>
      <input id="replay-setting" type="text" value={setting} onChange={(e) => setSetting(e.target.value)} maxLength={300} className="mt-1 w-full" placeholder="A weeknight, in the kitchen, after dinner" disabled={pending} />

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Who spoke first</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(
            [
              ["me", "I did"],
              ["partner", `${partnerName} did`],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${firstSpeaker === value ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`}>
              <input type="radio" name="first" value={value} checked={firstSpeaker === value} onChange={() => setFirstSpeaker(value)} className="sr-only" />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="replay-opening" className="mt-4 block text-sm font-medium">
        Roughly the first thing that was said
      </label>
      <input id="replay-opening" type="text" value={openingLine} onChange={(e) => setOpeningLine(e.target.value)} maxLength={300} className="mt-1 w-full" placeholder="Can we go through the statement tonight?" disabled={pending} />
      <p className="mt-1 text-sm text-muted">The replay starts from this line. If {partnerName} remembers it starting differently, they can decline and propose their own.</p>

      {error ? (
        <div className="mt-3">
          <Notice tone="warn">
            <span className="whitespace-pre-line">{error}</span>
          </Notice>
        </div>
      ) : null}
      <div className="mt-4">
        <Button type="submit" disabled={pending || !ready} aria-busy={pending}>
          {pending ? "Sending…" : `Ask ${partnerName}`}
        </Button>
      </div>
    </form>
  );
}
