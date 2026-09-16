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
      className="rounded-lg border border-accent bg-surface p-4"
      aria-labelledby="current-question"
    >
      <p id="current-question" className="font-medium">
        {item.text}
      </p>
      {item.topics?.length ? (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {item.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      {item.reason_text ? <p className="mt-2 text-sm text-muted">Why this is being asked: {item.reason_text}</p> : null}

      {isTag ? (
        <fieldset className="mt-3">
          <legend className="sr-only">Requirement or preference</legend>
          <div className="flex flex-wrap gap-3">
            {(["requirement", "preference"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 rounded border border-border px-3 py-1.5 has-[:checked]:border-accent has-[:checked]:bg-bar-track">
                <input type="radio" name="tag" value={t} checked={tag === t} onChange={() => setTag(t)} /> {t === "requirement" ? "Requirement" : "Preference"}
              </label>
            ))}
          </div>
          <label htmlFor="tag-comment" className="mt-3 block text-sm font-medium">
            {tagCommentPrompt}
          </label>
          <textarea id="tag-comment" required rows={4} value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1 w-full" />
        </fieldset>
      ) : (
        <>
          <label htmlFor="answer" className="sr-only">
            Your answer
          </label>
          <textarea id="answer" rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-3 w-full" placeholder="In your own words. A specific example helps." />
        </>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={shareable} onChange={(e) => setShareable(e.target.checked)} /> OK to show my partner this answer word for word
      </label>

      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || (isTag ? !tag || !comment.trim() : !text.trim())} aria-busy={pending}>
          {pending ? "Saving…" : isTag ? "Advance" : "Submit"}
        </Button>
        {!isTag ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => submitTurn({ type: "skip", sessionId, questionId: item.id }))}>
            {item.kind === "probe" ? skipLabel : "Skip"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
