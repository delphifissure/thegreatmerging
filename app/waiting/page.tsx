import Link from "next/link";
import * as data from "@/lib/data";
import { requirePartner } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Waiting } from "@/app/_components/Waiting";
import { LinkButton } from "@/app/_components/Button";
import { StartButton } from "./StartButton";

export default async function WaitingPage() {
  const user = await requirePartner();
  const progress = await data.getProgress(user.id, user.couple.id);
  const both = await data.coupleCompletionStatus(user.couple.id);
  const run = await data.getLatestRun(user.couple.id);
  const members = await data.listCoupleUsers(user.couple.id);
  const partner = members.find((m) => m.id !== user.id) ?? null;
  const layerDone = (list: data.InstrumentProgress[]) => list.filter((p) => p.required).every((p) => p.complete);
  const mine = { layer0: layerDone(progress.layer0), layer1: layerDone(progress.layer1) };
  const partnerDone = user.side === "a" ? both.b : both.a;

  return (
    <div className="space-y-6">
      <PageHeader title="Waiting room" lede="Nothing is compared until both of you have finished. Only completion status is shown here, never answers or scores." />
      <Card>
        <h2 className="text-lg font-semibold">Where each of you is</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Layer 0</th>
              <th scope="col">Layer 1</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{user.displayName} (you)</th>
              <td>{mine.layer0 ? "Complete" : "Not yet"}</td>
              <td>{mine.layer1 ? "Complete" : "Not yet"}</td>
            </tr>
            <tr>
              <th scope="row">{partner ? partner.display_name : "Your partner"}</th>
              <td colSpan={2}>{!partner ? "Has not joined yet" : partnerDone ? "Complete (both layers)" : "Not yet finished"}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {run && run.status === "complete" ? (
        <Card>
          <p className="text-lg font-medium">Your private results are ready.</p>
          <p className="mt-1 text-sm text-muted">Each of you sees your own first. Nothing shared exists yet.</p>
          <div className="mt-3">
            <LinkButton href="/results">See my results</LinkButton>
          </div>
        </Card>
      ) : run && (run.status === "running" || run.status === "pending") ? (
        <Waiting title="Interpreting… this takes a few minutes.">Both of you are done. Scoring and the interpreter are running; check back shortly.</Waiting>
      ) : run && run.status === "failed" ? (
        <Card>
          <p role="alert">Interpretation hit a problem. You can start it again.</p>
          <div className="mt-3">
            <StartButton label="Start interpretation again" />
          </div>
        </Card>
      ) : both.both ? (
        <Card>
          <p>Both of you have finished. Interpretation has not started yet.</p>
          <div className="mt-3">
            <StartButton label="Start interpretation" />
          </div>
        </Card>
      ) : !mine.layer0 || !mine.layer1 ? (
        <Waiting title="You haven't finished yet." refresh={false}>
          <Link href="/instruments" className="underline">
            Back to the instruments
          </Link>
        </Waiting>
      ) : (
        <Waiting title="Your partner hasn't finished yet.">You will be able to see your own results as soon as both of you are done.</Waiting>
      )}
    </div>
  );
}
