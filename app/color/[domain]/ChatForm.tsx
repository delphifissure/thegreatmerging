"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { submitTurn } from "./actions";

export type ChatItem = {
  id: string;
  kind: "question" | "tag" | "probe" | "followup";
  step: string;
  text: string;
  topics?: string[];
  reason_text?: string;
};

const KIND_LABEL: Record<ChatItem["kind"], string> = {
  question: "Question",
  followup: "One more on that",
  probe: "A follow-up, written from your answers",
  tag: "Requirement or preference",
};

/**
 * The current turn of the written questions. It reads like a note, not a chat window: the question
 * in the reading face, a plain reason a tap away, and the sharing choice explained where it is made.
 */
export function ChatForm({ sessionId, item, tagCommentPrompt, skipLabel }: { sessionId: string; item: ChatItem; tagCommentPrompt: string; skipLabel: string }) {
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [tag, setTag] = useState<"requirement" | "preference" | null>(null);
  const [shareable, setShareable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isTag = item.kind === "tag";

  const run = (fn: () => ReturnType<typeof submitTurn>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setText("");
        setComment("");
        setTag(null);
        setShareable(false);
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isTag) {
          if (!tag || !comment.trim()) return;
          run(() => submitTurn({ type: "tag", sessionId, questionId: item.id, tag, comment: comment.trim(), shareable }));
        } else {
          if (!text.trim()) return;
          run(() => submitTurn({ type: "answer", sessionId, questionId: item.id, text: text.trim(), shareable }));
        }
      }}
      className="anim-arrive rounded-card border border-accent/50 bg-surface p-5 shadow-card"
      aria-labelledby="current-question"
    >
      <p className="eyebrow mb-2">{KIND_LABEL[item.kind]}</p>
      <p id="current-question" className="reading text-[22px] leading-snug">
        {item.text}
      </p>
      {item.topics?.length ? (
        <ul className="reading mt-3 list-disc space-y-1 pl-5 text-[17px]">
          {item.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      {item.reason_text ? (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-accent">Why this is being asked</summary>
          <p className="reading mt-2 max-w-prose text-[15px]">
            {item.reason_text} This question was written by the app from your own words. It never decides anything about you, and your partner does not see it.
          </p>
        </details>
      ) : null}

      {isTag ? (
        <fieldset className="mt-4">
          <legend className="sr-only">Requirement or preference</legend>
          <div className="flex flex-wrap gap-2">
            {(["requirement", "preference"] as const).map((t) => (
              <label key={t} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors ${tag === t ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`}>
                <input type="radio" name="tag" value={t} checked={tag === t} onChange={() => setTag(t)} className="sr-only" /> {t === "requirement" ? "Requirement" : "Preference"}
              </label>
            ))}
          </div>
          <label htmlFor="tag-comment" className="mt-4 block text-sm font-medium">
            {tagCommentPrompt}
          </label>
          <textarea id="tag-comment" required rows={4} value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1.5 w-full" placeholder="A specific moment helps more than a general rule." />
        </fieldset>
      ) : (
        <>
          <label htmlFor="answer" className="sr-only">
            Your answer
          </label>
          <textarea id="answer" rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-4 w-full" placeholder="A specific moment helps more than a general rule." />
        </>
      )}

      <label className="mt-4 flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" checked={shareable} onChange={(e) => setShareable(e.target.checked)} /> My partner may read this word for word
      </label>
      <p className="mt-1 text-sm text-muted">Off means they see a short summary written by the app, never your exact words. Nothing is shown until you have both finished.</p>

      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button type="submit" disabled={pending || (isTag ? !tag || !comment.trim() : !text.trim())} aria-busy={pending}>
          {pending ? "Saving…" : isTag ? "Save and continue" : "Send"}
        </Button>
        {!isTag ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => submitTurn({ type: "skip", sessionId, questionId: item.id }))}>
            {item.kind === "probe" ? skipLabel : "Skip, that's fine"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
