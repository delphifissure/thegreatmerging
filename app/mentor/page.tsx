import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { mentorReadiness } from "@/lib/biographer/inputs";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";
import { MentorChat } from "./MentorChat";

export const metadata = { title: "You, one notch ahead" };

export default async function MentorPage() {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const [entries, threads, ratings] = await Promise.all([data.listOwnEntries(user.id, { status: "ratified" }), data.listOwnThreads(user.id, "mentor"), data.avatarRatings(user.id)]);
  const readiness = mentorReadiness(entries);
  const thread = threads.find((t) => t.status === "open") ?? null;
  const turns = thread ? await data.listTurns(thread.id, user.id) : [];
  const rated = ratings.like_me + ratings.not_like_me;
  const textOf = new Map(entries.map((e) => [e.id, e.text]));

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Prototype" title="You, one notch ahead" lede="You, rested, and a little further along on what you said you are working on. Still finding it hard. Noticing a bit sooner." />

      <div role="note" className="rounded-control border border-warn bg-warn-bg px-4 py-3 text-sm">
        <p className="font-medium">This is an avatar, not you.</p>
        <p className="mt-1">
          It is built from the {entries.length} lines you have ratified and nothing else. It can be wrong, and it never speaks for you to anyone. Nobody else can see or talk to it.
          {rated > 0 ? ` So far you have said ${ratings.like_me} of ${rated} replies sound like you.` : " Tell it when a reply does or doesn't sound like you; that is how it gets better."}
        </p>
      </div>

      {!readiness.ready ? (
        <Card dashed as="div">
          <p className="reading text-[17px]">
            There isn&rsquo;t enough of you on paper yet. This needs at least {readiness.needed} ratified constitution lines, including one under &ldquo;What I&rsquo;m working on&rdquo;. You have {readiness.ratifiedConstitution}
            {readiness.hasDirection ? "." : ", and none under that heading."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <LinkButton href="/biographer">Talk to the biographer</LinkButton>
            <LinkButton href="/documents" variant="secondary">
              Your documents
            </LinkButton>
          </div>
        </Card>
      ) : (
        <MentorChat
          turns={turns.map((t) => ({
            id: t.id,
            role: t.role,
            text: t.text,
            rating: t.rating,
            safety: t.meta.kind === "safety",
            unsure: t.meta.unsure === true,
            question: t.note,
            drawsOn: Array.isArray(t.meta.draws_on) ? (t.meta.draws_on as string[]).flatMap((id) => (textOf.has(id) ? [textOf.get(id)!] : [])) : [],
          }))}
        />
      )}

      <p className="text-sm text-muted">
        Built from{" "}
        <Link href="/documents" className="underline">
          your documents
        </Link>
        . Amend a line there and the avatar changes with it.
      </p>
    </div>
  );
}
