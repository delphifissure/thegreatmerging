import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { requireAppUser } from "@/app/_lib/session";
import { Card, Chip } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { ProposeForm } from "./ProposeForm";

export const metadata = { title: "Replay an argument" };

const STATUS_WORDS: Record<data.ReplayStatus, string> = { proposed: "Waiting for an answer", declined: "Declined", accepted: "Writing your accounts", running: "Running", complete: "Done", withdrawn: "Withdrawn" };

export default async function ReplayIndex() {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const partnerId = user.couple ? data.otherPartnerId(user.couple, user.id) : null;
  const [replays, people] = await Promise.all([data.listReplaysFor(user.id), user.couple ? data.listCoupleUsers(user.couple.id) : Promise.resolve([])]);
  const partnerName = people.find((p) => p.id === partnerId)?.display_name ?? "your partner";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Prototype · a test of the app, not of you"
        title="Replay an argument"
        lede="Before an avatar is trusted to rehearse a conversation you haven't had, it should be able to replay one you have. You each describe the same past argument, separately. Your two avatars play it out from how it started. Then each of you says whether your avatar moved the way you did."
      />

      <Card eyebrow="What crosses between you, and what doesn't">
        <ul className="reading list-disc space-y-1.5 pl-5 text-[16px]">
          <li>Your account of the argument is yours. {partnerName} never sees it, and neither does any avatar, except that your own avatar is told the state you were in.</li>
          <li>You read what your own avatar said. Of {partnerName}&rsquo;s avatar you see only the kind of move it made: asked, explained, went quiet. Your avatar&rsquo;s replies may echo something theirs said.</li>
          <li>Your avatar uses only lines you have allowed it to use. Lines you keep private stay out of the room.</li>
          <li>Each of you sees the other&rsquo;s one-word verdict, and nothing else about what the other thought.</li>
          <li>Either of you can withdraw at any point, and the replay is deleted.</li>
        </ul>
      </Card>

      {partnerId ? (
        <ProposeForm partnerName={partnerName} />
      ) : (
        <Card dashed as="div">
          <p className="reading text-[17px]">This needs both of you. Once your partner has joined, either of you can propose an argument to replay.</p>
        </Card>
      )}

      {replays.length > 0 ? (
        <Card>
          <h2 className="text-[22px]">Replays</h2>
          <ul className="mt-2 divide-y divide-rule">
            {replays.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-1 last:pb-0">
                <Link href={`/replay/${r.id}`} className="reading text-[17px] underline decoration-rule underline-offset-4 hover:decoration-accent">
                  {r.frame.label}
                </Link>
                <Chip tone={r.status === "proposed" && r.partnerId === user.id ? "accent" : "quiet"}>{r.status === "proposed" && r.partnerId === user.id ? "Waiting for you" : STATUS_WORDS[r.status]}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
