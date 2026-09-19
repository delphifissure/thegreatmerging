"use client";

import { useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import Link from "next/link";
import { askMentor, rateReply, rateReplyContent } from "./actions";
import { Correction } from "./Correction";

type ChatTurn = {
  id: string;
  role: "guide" | "person" | "avatar";
  text: string;
  rating: "like_me" | "not_like_me" | null;
  contentRating: "would_say" | "would_not_say" | null;
  correction: string | null;
  safety: boolean;
  unsure: boolean;
  question: string | null;
  drawsOn: string[];
};

const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-accent bg-accent text-accent-ink" : "border-rule bg-paper hover:border-accent/60"}`;

/**
 * Two questions, asked apart. A reply can sound exactly like you and still say something you never
 * would, and a good voice makes wrong content persuasive.
 */
function Rating({ turn }: { turn: ChatTurn }) {
  const [pending, start] = useTransition();
  const [voice, setVoice] = useState(turn.rating);
  const [content, setContent] = useState(turn.contentRating);
  const rateVoice = (r: "like_me" | "not_like_me") =>
    start(async () => {
      setVoice(r);
      const res = await rateReply({ turnId: turn.id, rating: r });
      if (!res.ok) setVoice(turn.rating);
    });
  const rateContent = (r: "would_say" | "would_not_say") =>
    start(async () => {
      setContent(r);
      const res = await rateReplyContent({ turnId: turn.id, rating: r });
      if (!res.ok) setContent(turn.contentRating);
    });
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Does this sound like you?">
        <span className="w-24 text-xs uppercase tracking-wide text-muted">How it sounds</span>
        <button type="button" disabled={pending} aria-pressed={voice === "like_me"} onClick={() => rateVoice("like_me")} className={pill(voice === "like_me")}>
          Sounds like me
        </button>
        <button type="button" disabled={pending} aria-pressed={voice === "not_like_me"} onClick={() => rateVoice("not_like_me")} className={pill(voice === "not_like_me")}>
          Doesn&rsquo;t sound like me
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Would you say this?">
        <span className="w-24 text-xs uppercase tracking-wide text-muted">What it says</span>
        <button type="button" disabled={pending} aria-pressed={content === "would_say"} onClick={() => rateContent("would_say")} className={pill(content === "would_say")}>
          I&rsquo;d say that
        </button>
        <button type="button" disabled={pending} aria-pressed={content === "would_not_say"} onClick={() => rateContent("would_not_say")} className={pill(content === "would_not_say")}>
          I wouldn&rsquo;t say that
        </button>
      </div>
      {content === "would_not_say" ? (
        <p className="text-sm text-muted">
          If it got you wrong, the fix is in{" "}
          <Link href="/documents" className="underline">
            your documents
          </Link>
          : amend the line it leaned on, or add the one that is missing. The avatar is rebuilt from them every time.
        </p>
      ) : null}
      <Correction key={turn.correction ?? ""} turnId={turn.id} correction={turn.correction} open={voice === "not_like_me" && !turn.correction} />
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
