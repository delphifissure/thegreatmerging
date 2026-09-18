import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { focusByKey } from "@/lib/biographer/inputs";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { Button, LinkButton } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { finishThread } from "../actions";
import { BiographerForm } from "./BiographerForm";

export const metadata = { title: "Biographer" };

export default async function BiographerThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  if (!FEATURES.biographer) notFound();
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();
  const user = await requireAppUser();
  const thread = await data.getOwnThread(threadId, user.id);
  if (!thread || thread.kind !== "biographer") notFound();
  const focus = focusByKey(thread.focus);
  const turns = await data.listTurns(thread.id, user.id);
  const last = turns[turns.length - 1];
  const earlier = thread.status === "open" && last?.role === "guide" ? turns.slice(0, -1) : turns;
  const said = turns.filter((t) => t.role === "person").length;
  const suggestStopping = last?.role === "guide" && last.meta.suggest_stopping === true;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/biographer" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          All conversations
        </Link>
        <h1 className="mt-2 text-2xl sm:text-[28px]">{focus?.title ?? "Conversation"}</h1>
        <p className="text-sm text-muted">Private to you. Saved as you go; stop whenever you like.</p>
      </div>

      {earlier.length > 0 ? (
        <ol className="space-y-2.5" aria-label="The conversation so far">
          {earlier.map((t) => (
            <li key={t.id} className={`reading max-w-prose whitespace-pre-line rounded-card p-4 text-[16px] ${t.role === "person" ? "ml-6 bg-tint" : t.meta.kind === "safety" ? "mr-6 border border-warn bg-warn-bg" : "mr-6 border border-rule bg-surface"}`}>
              <p className="eyebrow mb-1">{t.role === "person" ? "You" : "Biographer"}</p>
              {t.text}
            </li>
          ))}
        </ol>
      ) : null}

      {thread.status === "open" && last?.role === "guide" ? (
        <>
          <BiographerForm threadId={thread.id} question={last.text} why={last.note} safety={last.meta.kind === "safety"} />
          {suggestStopping ? <Notice>This looks like a good place to rest. You can stop here and the app will draft lines from what you said.</Notice> : null}
        </>
      ) : thread.status === "open" ? (
        <Card dashed as="div">
          <p className="reading text-[17px]">Your last answer is saved, but no next question arrived.</p>
          <div className="mt-3">
            <LinkButton href={`/biographer/${thread.id}`} variant="secondary">
              Reload
            </LinkButton>
          </div>
        </Card>
      ) : (
        <Card dashed as="div">
          <p className="reading text-[17px]">This conversation is finished.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <LinkButton href="/documents">Your documents</LinkButton>
            <LinkButton href="/biographer" variant="secondary">
              All conversations
            </LinkButton>
          </div>
        </Card>
      )}

      {thread.status === "open" ? (
        <form action={finishThread} className="border-t border-rule/70 pt-4">
          <input type="hidden" name="threadId" value={thread.id} />
          <Button type="submit" variant="secondary">
            Stop here for today
          </Button>
          <p className="mt-2 text-sm text-muted">{said >= 2 ? "The app will draft lines from what you said, for you to accept, edit or reject. This can take a minute." : "Say a little more first if you'd like lines drafted; two answers is the minimum."}</p>
        </form>
      ) : null}
    </div>
  );
}
