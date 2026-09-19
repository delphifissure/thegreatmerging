import Link from "next/link";
import { Card, Chip } from "@/app/_components/Card";
import { Notice } from "@/app/_components/Field";
import { ENDING_WORDS, MOVE_DID, type Ending, type Move, type Recognition } from "@/lib/replay/moves";
import { Coach, OverallVerdict, TurnVerdict } from "./Controls";

const MEANT: Record<string, string> = { "-2": "to push back hard", "-1": "coolly", "0": "neutrally", "1": "warmly", "2": "to reach toward them" };
const LANDED: Record<string, string> = { "-2": "it stung", "-1": "it grated", "0": "neither way", "1": "it eased things", "2": "it warmed them" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export type ViewTurn = {
  seq: number;
  mine: boolean;
  remembered: boolean;
  move: Move;
  secondaryMove: Move | null;
  says: string | null;
  does: string | null;
  intent: number | null;
  /** How this turn landed on the other avatar: the impact the next turn reported. */
  landed: number | null;
  ends: boolean;
  drawsOn: string[];
  rating: "like_me" | "not_like_me" | null;
  /** While both have opened their words: what the other person made of this turn of my avatar's. */
  partnerFlag: "like_me" | "not_like_me" | null;
  coachNote: string | null;
};

function MoveList({ title, moves, tone = "quiet" }: { title: string; moves: Move[]; tone?: "accent" | "quiet" }) {
  return (
    <div>
      <p className="text-sm text-muted">{title}</p>
      <p className="mt-1 flex flex-wrap gap-1.5">{moves.length ? moves.map((m) => <Chip key={m} tone={tone}>{MOVE_DID[m]}</Chip>) : <span className="text-sm text-muted">nothing</span>}</p>
    </div>
  );
}

function RecognitionCard({ eyebrow, who, r }: { eyebrow: string; who: string; r: Recognition }) {
  const total = r.matched.length + r.onlyRemembered.length + r.onlyAvatar.length;
  return (
    <Card eyebrow={eyebrow}>
      <p className="reading text-[17px]">
        {total === 0 ? "Nothing to compare yet." : `${r.matched.length} of ${total} kinds of move appear both in your memory and in what ${who} did.`}
      </p>
      <div className="mt-3 space-y-3">
        <MoveList title="In both" moves={r.matched} tone="accent" />
        <MoveList title={`You remember it, and ${who} never did it`} moves={r.onlyRemembered} />
        <MoveList title={`${who.charAt(0).toUpperCase()}${who.slice(1)} did it, and you don't remember it`} moves={r.onlyAvatar} />
      </div>
      <p className="mt-3 text-sm text-muted">Counted by code from the ticks in your account and the coded moves. Order is ignored, because people remember what they did in an argument far better than when. Explaining and defending count as one, and so do going quiet and leaving: they are the same act seen from inside and from outside.</p>
    </Card>
  );
}

/** One person's view of a replay. Presentation only: what it is handed has already been cut down to what this person may see. */
export function ReplayView({
  replayId,
  partnerName,
  turns,
  complete,
  own,
  partner,
  remembered,
  replayEnding,
  tooEasy,
  myVerdict,
  partnerVerdict,
  open,
  current,
}: {
  replayId: string;
  partnerName: string;
  turns: ViewTurn[];
  complete: boolean;
  own: Recognition | null;
  partner: Recognition | null;
  remembered: Ending | null;
  replayEnding: Ending | null;
  tooEasy: boolean;
  myVerdict: "yes" | "partly" | "no" | null;
  partnerVerdict: "yes" | "partly" | "no" | null;
  /** Both people have opened their avatar's words. */
  open: boolean;
  /** This is the current take, so it can be rated, coached and run again. */
  current: boolean;
}) {
  const both = myVerdict && partnerVerdict ? [myVerdict, partnerVerdict] : null;
  return (
    <div className="space-y-5">
      <ol className="space-y-2.5" aria-label="The replay, turn by turn">
        {turns.map((t) => (
          <li key={t.seq} className={`max-w-prose rounded-card p-4 ${t.mine ? "ml-6 bg-tint" : "mr-6 border border-rule bg-surface"}`}>
            <p className="eyebrow mb-1">
              {t.remembered ? "As you both agreed it started" : t.mine ? "Your avatar" : `${partnerName}'s avatar`} · {MOVE_DID[t.move]}
              {t.secondaryMove && t.secondaryMove !== t.move ? `, and ${MOVE_DID[t.secondaryMove]}` : ""}
            </p>
            {t.says ? <p className="reading whitespace-pre-line text-[17px]">&ldquo;{t.says}&rdquo;</p> : null}
            {t.does ? <p className="reading text-[16px] italic text-muted">{t.does}</p> : null}
            {!t.mine && !t.remembered && !t.says && !t.does ? <p className="text-sm text-muted">What it said is {partnerName}&rsquo;s to read, not yours.</p> : null}
            {!t.mine && t.coachNote ? <p className="mt-2 text-sm text-muted">{partnerName}&rsquo;s coaching: &ldquo;{t.coachNote}&rdquo;</p> : null}
            {t.mine && t.partnerFlag === "not_like_me" ? <p className="mt-2 text-sm text-muted">{partnerName} doesn&rsquo;t remember you doing this.</p> : null}
            {t.mine && !t.remembered && (t.intent !== null || t.landed !== null) ? (
              <p className="mt-2 text-sm text-muted">
                {t.intent !== null ? `Meant ${MEANT[String(t.intent)]} (${signed(t.intent)})` : ""}
                {t.intent !== null && t.landed !== null ? " · " : ""}
                {t.landed !== null ? `on ${partnerName}'s avatar ${LANDED[String(t.landed)]} (${signed(t.landed)})` : ""}
              </p>
            ) : null}
            {t.mine && t.drawsOn.length > 0 ? (
              <details className="mt-2 text-sm text-muted">
                <summary className="cursor-pointer font-medium text-accent">Which of your lines this drew on</summary>
                <ul className="reading mt-1.5 list-disc space-y-1 pl-5 text-[15px]">
                  {t.drawsOn.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {current && !t.remembered && complete && (t.mine || open) ? <TurnVerdict replayId={replayId} seq={t.seq} rating={t.rating} theirs={!t.mine} /> : null}
            {current && t.mine && !t.remembered ? <Coach key={t.coachNote ?? ""} replayId={replayId} seq={t.seq} note={t.coachNote} canRetake /> : null}
          </li>
        ))}
      </ol>

      {complete && current ? (
        <>
          {tooEasy ? <Notice tone="warn">This replay settled faster than real arguments do. Model avatars agree too easily, so treat this one with suspicion, whatever it looks like.</Notice> : null}
          {own ? <RecognitionCard eyebrow="What you remember doing, against what your avatar did" who="your avatar" r={own} /> : null}
          {partner ? <RecognitionCard eyebrow={`What you remember ${partnerName} doing, against what ${partnerName}'s avatar did`} who={`${partnerName}'s avatar`} r={partner} /> : null}
          {remembered && replayEnding ? (
            <Card eyebrow="How it ended">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted">As you remember it</dt>
                  <dd className="reading text-[17px]">{ENDING_WORDS[remembered]}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">The replay, read from its last moves</dt>
                  <dd className="reading text-[17px]">{ENDING_WORDS[replayEnding]}</dd>
                </div>
              </dl>
            </Card>
          ) : null}

          <Card eyebrow="Your verdict">
            <p className="reading text-[18px]">Did the replay have the shape of what happened?</p>
            <p className="mt-1 text-sm text-muted">Not the words. The shape: who pressed, who explained, who went quiet, how it stopped. {partnerName} is told this one word and nothing else.</p>
            <div className="mt-3">
              <OverallVerdict replayId={replayId} verdict={myVerdict} />
            </div>
            {both ? (
              <p className="reading mt-4 border-t border-rule/70 pt-3 text-[17px]">
                {both.every((v) => v === "no")
                  ? "Neither of you recognized it. By this project's own test, the avatars are not ready to rehearse a conversation you haven't had yet. More time with the biographer comes first."
                  : both.every((v) => v === "yes")
                    ? "Both of you recognized the shape. That is one argument, not proof, but it is the result this test was looking for."
                    : both.includes("no")
                      ? "One of you recognized it and one of you didn't. That usually means one avatar is closer to its person than the other."
                      : "Between you, it was partly right. Worth looking at which of your avatar's turns you marked as not yours."}
              </p>
            ) : myVerdict ? (
              <p className="mt-3 text-sm text-muted">Waiting for {partnerName}&rsquo;s verdict.</p>
            ) : null}
          </Card>
          <p className="text-sm text-muted">
            Turns you marked &ldquo;I didn&rsquo;t do this&rdquo; are where your avatar is wrong about you. The fix is in{" "}
            <Link href="/documents" className="underline">
              your documents
            </Link>{" "}
            or another conversation with{" "}
            <Link href="/biographer" className="underline">
              your biographer
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );
}
