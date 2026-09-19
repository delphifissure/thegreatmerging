"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { Toggle } from "@/app/_components/Toggle";
import { addOwn, ratify, reject, remove, setTier } from "./actions";

type Mark = "settled" | "open";
type Tier = "private" | "avatar_only" | "shareable";
const TIER_WORDS: Record<Tier, string> = { private: "Private", avatar_only: "My avatar may act on it", shareable: "My avatar may say it" };

function MarkSwitch({ id, mark, onChange, disabled }: { id: string; mark: Mark; onChange: (m: Mark) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <Toggle checked={mark === "settled"} onChange={(on) => onChange(on ? "settled" : "open")} disabled={disabled} aria-labelledby={`${id}-mark`} />
      <span id={`${id}-mark`}>{mark === "settled" ? "Settled: this is me, don't vary it" : "Open: I'd look at what a different me would do"}</span>
    </span>
  );
}

export function ProposedLine({ entry, sectionTitle }: { entry: { id: string; text: string; mark: Mark; section: string; document: string; in_their_words: boolean }; sectionTitle: string }) {
  const [text, setText] = useState(entry.text);
  const [mark, setMark] = useState<Mark>(entry.mark);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work.");
    });
  const edited = text.trim() !== entry.text;
  return (
    <li className="py-4 first:pt-1 last:pb-0">
      <p className="eyebrow">{sectionTitle}</p>
      <label htmlFor={`line-${entry.id}`} className="sr-only">
        The drafted line
      </label>
      <textarea id={`line-${entry.id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5 w-full" disabled={pending} />
      <div className="mt-2">
        <MarkSwitch id={entry.id} mark={mark} onChange={setMark} disabled={pending} />
      </div>
      {error ? (
        <div className="mt-2">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button size="sm" disabled={pending || !text.trim()} onClick={() => run(() => ratify({ entryId: entry.id, mark, ...(edited ? { text: text.trim() } : {}) }))}>
          {edited ? "Sign my version" : "That's me, sign it"}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => reject({ entryId: entry.id }))}>
          Not me
        </Button>
      </div>
    </li>
  );
}

export function RatifiedLine({ entry }: { entry: { id: string; text: string; mark: Mark; tier: Tier } }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [mark, setMark] = useState<Mark>(entry.mark);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work.");
      else after?.();
    });
  if (!editing) {
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
        <p className="reading max-w-prose text-[17px]">{entry.text}</p>
        <span className="flex items-center gap-3 text-sm text-muted">
          <span>{entry.mark === "settled" ? "Settled" : "Open"}</span>
          <span>{TIER_WORDS[entry.tier]}</span>
          <button type="button" onClick={() => setEditing(true)} className="underline decoration-rule underline-offset-4 hover:text-ink">
            Amend
          </button>
        </span>
      </li>
    );
  }
  return (
    <li className="py-3">
      <label htmlFor={`amend-${entry.id}`} className="sr-only">
        Amend this line
      </label>
      <textarea id={`amend-${entry.id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} className="w-full" disabled={pending} />
      <div className="mt-2">
        <MarkSwitch id={`r-${entry.id}`} mark={mark} onChange={setMark} disabled={pending} />
      </div>
      <div className="mt-3 text-sm">
        <label htmlFor={`tier-${entry.id}`} className="block font-medium">
          When your avatar meets your partner&rsquo;s avatar
        </label>
        <select id={`tier-${entry.id}`} value={entry.tier} disabled={pending} onChange={(e) => run(() => setTier({ entryId: entry.id, tier: e.target.value as Tier }))} className="mt-1">
          <option value="private">Private: leave this line out of the room</option>
          <option value="avatar_only">My avatar may act on it, and never say it</option>
          <option value="shareable">My avatar may say it</option>
        </select>
        <p className="mt-1 text-muted">Your own avatars, the ones only you talk to, always use every line. This only matters in a replay or a rehearsal.</p>
      </div>
      {error ? (
        <div className="mt-2">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button size="sm" disabled={pending || !text.trim()} onClick={() => run(() => ratify({ entryId: entry.id, text: text.trim(), mark }), () => setEditing(false))}>
          Sign the amendment
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => remove({ entryId: entry.id }))}>
          Strike this line
        </Button>
      </div>
    </li>
  );
}

export function AddOwnLine({ document, sections }: { document: "history" | "constitution"; sections: Array<{ key: string; title: string }> }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(sections[0]?.key ?? "");
  const [text, setText] = useState("");
  const [mark, setMark] = useState<Mark>("open");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <div className="mt-5 border-t border-rule/70 pt-4">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Write a line yourself
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-3 border-t border-rule/70 pt-4">
      <div>
        <label htmlFor={`own-section-${document}`} className="block text-sm font-medium">
          Where it belongs
        </label>
        <select id={`own-section-${document}`} value={section} onChange={(e) => setSection(e.target.value)} className="mt-1" disabled={pending}>
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`own-text-${document}`} className="block text-sm font-medium">
          The line, in your words
        </label>
        <textarea id={`own-text-${document}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full" disabled={pending} />
      </div>
      <MarkSwitch id={`own-${document}`} mark={mark} onChange={setMark} disabled={pending} />
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2.5">
        <Button
          size="sm"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await addOwn({ document, section, text: text.trim(), mark });
              if (!r.ok) setError(r.error);
              else {
                setText("");
                setOpen(false);
              }
            })
          }
        >
          Sign it
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
