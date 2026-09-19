import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { REPLAY_LIMITS } from "@/lib/replay/inputs";
import { endingOf, recognition, resolvedTooEasily } from "@/lib/replay/moves";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { LinkButton } from "@/app/_components/Button";
import { AccountForm, AllowAllLines, Respond, Runner, WatchTogether, Withdraw } from "./Controls";
import { ReplayView, type ViewTurn } from "./ReplayView";

export const metadata = { title: "Replay an argument" };

export default async function ReplayPage({ params, searchParams }: { params: Promise<{ replayId: string }>; searchParams: Promise<{ take?: string }> }) {
  if (!FEATURES.biographer) notFound();
  const { replayId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(replayId)) notFound();
  const user = await requireAppUser();
  const replay = await data.getReplayFor(replayId, user.id);
  if (!replay) notFound();
  const asked = Number((await searchParams).take);
  const take = Number.isInteger(asked) && asked >= 1 && asked <= replay.take ? asked : replay.take;
  const current = take === replay.take;

  const partnerId = replay.proposerId === user.id ? replay.partnerId : replay.proposerId;
  const [people, own, progress, turns, entries, flags] = await Promise.all([
    data.listCoupleUsers(replay.coupleId),
    data.getOwnAccount(replay.id, user.id),
    data.replayProgress(replay.id),
    data.listReplayTurns(replay.id, user.id, take),
    data.listOwnEntries(user.id, { status: "ratified" }),
    replay.open.both && current ? data.partnerFlags(replay.id, user.id) : Promise.resolve({} as Record<string, "like_me" | "not_like_me">),
  ]);
  const iOpened = replay.proposerId === user.id ? replay.open.proposer : replay.open.partner;
  const theyOpened = replay.proposerId === user.id ? replay.open.partner : replay.open.proposer;
  const partnerName = people.find((p) => p.id === partnerId)?.display_name ?? "your partner";
  const iProposed = replay.proposerId === user.id;
  const opener = (replay.frame.firstSpeaker === "proposer") === iProposed ? "you" : partnerName;
  const partnerHasAccount = progress.some((p) => p.userId === partnerId);
  const live = replay.status === "accepted" || replay.status === "running" || replay.status === "complete";
  const readiness = live ? await data.replayReadiness({ replayId: replay.id, actorUserId: user.id }) : null;
  const mine = readiness?.find((r) => r.userId === user.id);
  const theirs = readiness?.find((r) => r.userId === partnerId);
  const bothReady = !!mine && !!theirs && mine.constitution >= REPLAY_LIMITS.minLines && theirs.constitution >= REPLAY_LIMITS.minLines;

  const textOf = new Map(entries.map((e) => [e.id, e.text]));
  const coded = turns.map((t) => ({ speaker: t.speakerId, move: t.move, secondary: t.secondaryMove, remembered: t.remembered }));
  const view: ViewTurn[] = turns.map((t, i) => ({
    seq: t.seq,
    mine: t.speakerId === user.id,
    remembered: t.remembered,
    move: t.move,
    secondaryMove: t.secondaryMove,
    says: t.words?.says ?? null,
    does: t.words?.does ?? null,
    intent: t.intent,
    landed: turns[i + 1]?.impact ?? null,
    ends: t.ends,
    drawsOn: t.drawsOn.flatMap((id) => (textOf.has(id) ? [textOf.get(id)!] : [])),
    rating: current ? (own?.turnRatings[String(t.seq)] ?? null) : null,
    partnerFlag: t.speakerId === user.id ? (flags[String(t.seq)] ?? null) : null,
    coachNote: t.coachNote,
  }));
  const complete = replay.status === "complete" || !current;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/replay" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          All replays
        </Link>
        <h1 className="mt-2 text-2xl sm:text-[28px]">{replay.frame.label}</h1>
        <p className="text-sm text-muted">
          {replay.frame.setting}. It started with {opener}: &ldquo;{replay.frame.openingLine}&rdquo;
        </p>
      </div>

      {replay.status === "proposed" ? (
        iProposed ? (
          <Card dashed as="div">
            <p className="reading text-[17px]">Waiting for {partnerName} to say yes or no. Nothing happens until they do.</p>
          </Card>
        ) : (
          <Card eyebrow={`${partnerName} would like to replay this argument with you`}>
            <ul className="reading list-disc space-y-1.5 pl-5 text-[16px]">
              <li>You each write your own account, separately. Neither of you sees the other&rsquo;s, and no avatar sees what either of you remembers doing.</li>
              <li>Your avatar is built from lines you allow it to use, and it is told the state you were in. It then plays the argument out with {partnerName}&rsquo;s avatar.</li>
              <li>You read what your own avatar said. Of {partnerName}&rsquo;s you see only the kind of move it made, and they see the same of yours. Your avatar&rsquo;s replies may echo something theirs said.</li>
              <li>At the end each of you sees the other&rsquo;s one-word verdict. Either of you can withdraw at any point and the replay is deleted.</li>
              <li>This tests the app, not either of you. If you remember it starting differently, say no and propose your own.</li>
            </ul>
            <div className="mt-4">
              <Respond replayId={replay.id} />
            </div>
          </Card>
        )
      ) : null}

      {replay.status === "declined" ? (
        <Card dashed as="div">
          <p className="reading text-[17px]">{iProposed ? `${partnerName} said no to this one. That needs no reason.` : "You said no to this one."}</p>
        </Card>
      ) : null}
      {replay.status === "withdrawn" ? (
        <Card dashed as="div">
          <p className="reading text-[17px]">This replay was withdrawn, and what the avatars said has been deleted.</p>
        </Card>
      ) : null}

      {replay.status === "accepted" ? (
        <>
          {mine && mine.constitution < REPLAY_LIMITS.minLines ? (
            <Card eyebrow="Your rehearsal avatar">
              <p className="reading text-[17px]">
                With someone else&rsquo;s avatar in the room, yours uses only lines you have allowed. It needs {REPLAY_LIMITS.minLines} from your constitution and has {mine.constitution}, out of {mine.ratified} lines you have ratified in all.
              </p>
              {mine.ratified >= REPLAY_LIMITS.minLines ? (
                <AllowAllLines />
              ) : (
                <div className="mt-3">
                  <LinkButton href="/biographer" variant="secondary">
                    Talk to the biographer
                  </LinkButton>
                </div>
              )}
            </Card>
          ) : null}
          <AccountForm key={own ? "edit" : "new"} replayId={replay.id} partnerName={partnerName} initial={own ? own.account : null} />
          {own ? (
            partnerHasAccount ? (
              bothReady ? (
                <Runner replayId={replay.id} turns={turns.length} started={false} />
              ) : (
                <Card dashed as="div">
                  <p className="reading text-[17px]">
                    Both accounts are in. {mine && mine.constitution < REPLAY_LIMITS.minLines ? "Your rehearsal avatar needs more lines it may use (see above)." : `${partnerName}'s rehearsal avatar does not have enough lines it may use yet. That is theirs to change.`}
                  </p>
                </Card>
              )
            ) : (
              <Card dashed as="div">
                <p className="reading text-[17px]">Your account is saved. Waiting for {partnerName} to write theirs.</p>
              </Card>
            )
          ) : null}
        </>
      ) : null}

      {live ? <WatchTogether replayId={replay.id} partnerName={partnerName} mine={iOpened} theirs={theyOpened} /> : null}

      {replay.status === "running" || replay.status === "complete" ? (
        <>
          {replay.take > 1 ? (
            <nav aria-label="Takes" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Takes:</span>
              {Array.from({ length: replay.take }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={n === replay.take ? `/replay/${replay.id}` : `/replay/${replay.id}?take=${n}`} aria-current={n === take ? "page" : undefined} className={`rounded-full border px-3 py-1 ${n === take ? "border-accent bg-tint text-ink" : "border-rule text-muted hover:text-ink"}`}>
                  {n === replay.take ? `${n} · current` : n}
                </Link>
              ))}
            </nav>
          ) : null}
          <ReplayView
            replayId={replay.id}
            partnerName={partnerName}
            turns={view}
            complete={complete}
            own={complete && own ? recognition(own.account.myMoves, coded, user.id) : null}
            partner={complete && own ? recognition(own.account.theirMoves, coded, partnerId) : null}
            remembered={own?.account.ending ?? null}
            replayEnding={complete ? endingOf(coded) : null}
            tooEasy={complete && resolvedTooEasily(coded)}
            myVerdict={own?.verdict ?? null}
            partnerVerdict={own?.verdict ? (progress.find((p) => p.userId === partnerId)?.verdict ?? null) : null}
            open={replay.open.both}
            current={current}
          />
          {replay.status === "running" && current ? <Runner key={replay.take} replayId={replay.id} turns={turns.length} started retake={replay.take > 1} /> : null}
        </>
      ) : null}

      {replay.status !== "withdrawn" && replay.status !== "declined" ? (
        <div className="border-t border-rule/70 pt-4">
          <Withdraw replayId={replay.id} />
        </div>
      ) : null}
    </div>
  );
}
