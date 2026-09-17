import Link from "next/link";
import * as data from "@/lib/data";
import { PART_TITLES } from "@/lib/copy";
import { requirePartner } from "@/app/_lib/session";
import { Card, Chip } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { LinkButton } from "@/app/_components/Button";
import { StartButton } from "./StartButton";

export const metadata = { title: "Where you both are" };

function State({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <Chip tone={done ? "accent" : "quiet"}>{done ? "Done" : "Not yet"}</Chip>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default async function WaitingPage() {
  const user = await requirePartner();
  const [progress, both, run, members] = await Promise.all([
    data.getProgress(user.id, user.couple.id),
    data.coupleCompletionStatus(user.couple.id),
    data.getLatestRun(user.couple.id),
    data.listCoupleUsers(user.couple.id),
  ]);
  const partner = members.find((m) => m.id !== user.id) ?? null;
  const layerDone = (list: data.InstrumentProgress[]) => list.filter((p) => p.required).every((p) => p.complete);
  const mine = { layer0: layerDone(progress.layer0), layer1: layerDone(progress.layer1) };
  const partnerDone = user.side === "a" ? both.b : both.a;

  return (
    <div className="space-y-6">
      <PageHeader title="Where you both are" lede="Nothing is compared until both of you have finished. Only whether each of you is done shows here, never an answer or a score." />
      <Card>
        <ul className="divide-y divide-rule">
          <li className="py-3 first:pt-0">
            <p className="font-display text-[19px]">{user.displayName} (you)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{PART_TITLES.layer0}</span>
                <State done={mine.layer0} label={`${PART_TITLES.layer0}: ${mine.layer0 ? "done" : "not yet"}`} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{PART_TITLES.layer1}</span>
                <State done={mine.layer1} label={`${PART_TITLES.layer1}: ${mine.layer1 ? "done" : "not yet"}`} />
              </div>
            </div>
          </li>
          <li className="py-3 last:pb-0">
            <p className="font-display text-[19px]">{partner ? partner.display_name : "Your partner"}</p>
            <p className="mt-2 text-sm text-muted">{!partner ? "Has not joined yet." : partnerDone ? "Finished both parts." : "Not finished yet."}</p>
          </li>
        </ul>
      </Card>

      {run && run.status === "complete" ? (
        <Card>
          <p className="font-display text-[20px]">Your private results are ready.</p>
          <p className="mt-1 text-sm text-muted">Each of you reads your own first. Nothing shared exists yet.</p>
          <div className="mt-3">
            <LinkButton href="/results">Read my results</LinkButton>
          </div>
        </Card>
      ) : run && (run.status === "running" || run.status === "pending") ? (
        <Waiting title="Reading your answers.">Both of you are done. This usually takes a few minutes.</Waiting>
      ) : run && run.status === "failed" ? (
        <Card>
          <p role="alert">Reading your answers hit a problem. You can start it again.</p>
          <div className="mt-3">
            <StartButton label="Try again" />
          </div>
        </Card>
      ) : both.both ? (
        <Card>
          <p>Both of you have finished. Your results have not been prepared yet.</p>
          <div className="mt-3">
            <StartButton label="Prepare our results" />
          </div>
        </Card>
      ) : !mine.layer0 || !mine.layer1 ? (
        <Waiting title="You haven't finished yet." refresh={false}>
          <Link href="/instruments" className="underline">
            Back to the questionnaires
          </Link>
        </Waiting>
      ) : (
        <Waiting title={`${partner?.display_name ?? "Your partner"} hasn't finished yet.`}>You will be able to read your own results as soon as both of you are done.</Waiting>
      )}
    </div>
  );
}
