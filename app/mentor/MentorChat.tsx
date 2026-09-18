"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { askMentor, rateReply } from "./actions";

type ChatTurn = { id: string; role: "guide" | "person" | "avatar"; text: string; rating: "like_me" | "not_like_me" | null; safety: boolean; unsure: boolean; question: string | null; drawsOn: string[] };

function Rating({ turn }: { turn: ChatTurn }) {
  const [pending, start] = useTransition();
  const [rating, setRating] = useState(turn.rating);
  const rate = (r: "like_me" | "not_like_me") =>
    start(async () => {
      setRating(r);
      const res = await rateReply({ turnId: turn.id, rating: r });
      if (!res.ok) setRating(turn.rating);
    });
  const cls = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Does this sound like you?">
      <button type="button" disabled={pending} aria-pressed={rating === "like_me"} onClick={() => rate("like_me")} className={cls(rating === "like_me")}>
        Sounds like me
      </button>
      <button type="button" disabled={pending} aria-pressed={rating === "not_like_me"} onClick={() => rate("not_like_me")} className={cls(rating === "not_like_me")}>
        Doesn&rsquo;t sound like me
      </button>
    </div>
  );
}

export function MentorChat({ turns }: { turns: ChatTurn[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      setError(null);
      const r = await askMentor({ text: text.trim() });
      if (!r.ok) setError(r.error);
      else setText("");
    });

  return (
    <div className="space-y-4">
      {turns.length > 0 ? (
        <ol className="space-y-2.5" aria-label="The conversation so far">
          {turns.map((t) => (
            <li key={t.id} className={`max-w-prose rounded-card p-4 ${t.role === "person" ? "ml-6 bg-tint" : t.safety ? "mr-6 border border-warn bg-warn-bg" : "mr-6 border border-rule bg-surface"}`}>
              <p className="eyebrow mb-1">{t.role === "person" ? "You" : t.safety ? "The app" : "Your avatar, one notch ahead"}</p>
              <p className="reading whitespace-pre-line text-[17px]">{t.text}</p>
              {t.role === "avatar" && t.unsure && t.question ? <p className="mt-2 text-sm text-muted">It wasn&rsquo;t sure about you here, so it has passed a question to your biographer: &ldquo;{t.question}&rdquo;</p> : null}
              {t.role === "avatar" && t.drawsOn.length > 0 ? (
                <details className="mt-2 text-sm text-muted">
                  <summary className="cursor-pointer font-medium text-accent">Which of your lines this drew on</summary>
                  <ul className="reading mt-1.5 list-disc space-y-1 pl-5 text-[15px]">
                    {t.drawsOn.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {t.role === "avatar" ? <Rating turn={t} /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send();
        }}
        className="rounded-card border border-accent/50 bg-surface p-5 shadow-card"
      >
        <label htmlFor="mentor-text" className="reading block text-[19px]">
          {turns.length === 0 ? "What's on your mind? A moment from this week is a good place to start." : "Go on."}
        </label>
        <textarea id="mentor-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="mt-3 w-full" placeholder="What happened, and what you did." disabled={pending} />
        {error ? (
          <div className="mt-3">
            <Notice tone="warn">{error}</Notice>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !text.trim()} aria-busy={pending}>
            {pending ? "Thinking…" : "Send"}
          </Button>
          {pending ? <span className="text-sm text-muted">This takes a few seconds.</span> : null}
        </div>
      </form>
    </div>
  );
}
