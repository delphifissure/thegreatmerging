import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { FOCI, mentorReadiness } from "@/lib/biographer/inputs";
import { requireAppUser } from "@/app/_lib/session";
import { Card, Chip } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Button, LinkButton } from "@/app/_components/Button";
import { startThread } from "./actions";

export const metadata = { title: "Biographer" };

export default async function BiographerIndex() {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const [threads, entries, openQuestions] = await Promise.all([data.listOwnThreads(user.id, "biographer"), data.listOwnEntries(user.id), data.listOpenQuestions(user.id)]);
  const ratified = entries.filter((e) => e.status === "ratified");
  const proposed = entries.filter((e) => e.status === "proposed");
  const readiness = mentorReadiness(entries);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prototype"
        title="Your biographer"
        lede="Unhurried conversations whose only aim is to understand you. Afterwards the app drafts lines for two documents you own, your history and your constitution. Nothing enters either one until you sign it. All of this is private to you."
      />

      {proposed.length > 0 ? (
        <Card>
          <p className="reading text-[17px]">
            {proposed.length} drafted {proposed.length === 1 ? "line is" : "lines are"} waiting for you to accept, edit or reject.
          </p>
          <div className="mt-3">
            <LinkButton href="/documents">Review them</LinkButton>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-[22px]">Conversations</h2>
        <ul className="mt-2 divide-y divide-rule">
          {FOCI.map((f) => {
            const mine = threads.filter((t) => t.focus === f.key);
            const open = mine.find((t) => t.status === "open");
            return (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4 first:pt-2 last:pb-0">
                <div className="min-w-0 max-w-prose">
                  <p className="font-display text-[19px]">{f.title}</p>
                  <p className="reading text-[15px] text-muted">{f.about}</p>
                  {mine.length > 0 ? <p className="mt-1 text-xs text-muted">{mine.length === 1 ? "One conversation so far" : `${mine.length} conversations so far`}</p> : null}
                </div>
                {open ? (
                  <LinkButton href={`/biographer/${open.id}`} variant="secondary">
                    Continue
                  </LinkButton>
                ) : (
                  <form action={startThread}>
                    <input type="hidden" name="focus" value={f.key} />
                    <Button type="submit" variant={mine.length ? "secondary" : "primary"}>
                      {mine.length ? "Talk again" : "Start"}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {openQuestions.length > 0 ? (
        <Card eyebrow="Questions kept for next time">
          <ul className="reading list-disc space-y-1 pl-5 text-[16px]">
            {openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Some came from places your documents are still thin, some from things your avatar couldn&rsquo;t answer about you. The biographer works them in when they fit the topic.</p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[22px]">Your documents</h2>
          <Chip>{ratified.length} ratified</Chip>
        </div>
        <p className="reading mt-1 text-[16px] text-muted">Your history and your constitution, in your own words.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <LinkButton href="/documents" variant="secondary">
            Open them
          </LinkButton>
        </div>
      </Card>

      <Card>
        <h2 className="text-[22px]">You, one notch ahead</h2>
        <p className="reading mt-1 max-w-prose text-[16px] text-muted">
          An avatar built only from lines you have ratified: you, rested, a little further along on what you said you are working on. It can be wrong, and it never speaks for you.
        </p>
        {readiness.ready ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <LinkButton href="/mentor">Talk to it</LinkButton>
            <LinkButton href="/mentor/panel" variant="secondary">
              Ask all of me
            </LinkButton>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            It needs at least {readiness.needed} ratified constitution lines, including one under &ldquo;What I&rsquo;m working on&rdquo;. You have {readiness.ratifiedConstitution}
            {readiness.hasDirection ? "." : ", and none under that heading yet."} The conversation called{" "}
            <Link href="/biographer" className="underline">
              What you&rsquo;re working on
            </Link>{" "}
            is the quickest way there.
          </p>
        )}
      </Card>
    </div>
  );
}
