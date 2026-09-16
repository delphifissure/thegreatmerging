import * as data from "@/lib/data";
import extended from "@/config/extended.json";
import { INSTRUMENTS, isInstrumentKey } from "@/instruments/registry";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Notice } from "@/app/_components/Field";
import { AnswerForm } from "../AnswerForm";
import { InviteCaregiverForm } from "../InviteCaregiverForm";
import { saveCaregiverAnswer } from "../actions";

export default async function CaregiverPage() {
  const user = await requireAppUser();
  const cfg = extended.caregiver;
  const answers = user.couple ? await data.listCaregiverAnswers(user.couple.id, user.id) : [];
  const members = user.couple ? await data.listCoupleMembers(user.couple.id) : [];
  const caregivers = members.filter((m) => m.role === "caregiver");
  return (
    <div className="space-y-6">
      <PageHeader title={cfg.title} lede={cfg.intro} />
      {!user.couple ? <Notice>Create or join a couple first.</Notice> : null}
      {user.couple && user.role === "partner" ? (
        <Card>
          <h2 className="text-lg font-semibold">Invite a caregiver</h2>
          <p className="mt-1 text-sm text-muted">They get their own account, see only their own answers, and see only the parenting brief sections you choose to share.</p>
          {caregivers.length > 0 ? <p className="mt-2 text-sm">Linked: {caregivers.map((c) => c.display_name).join(", ")}.</p> : null}
          <div className="mt-3">
            <InviteCaregiverForm />
          </div>
        </Card>
      ) : null}
      <Card>
        <h2 className="text-lg font-semibold">Instruments for a caregiver</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {cfg.instruments.map((k) => (
            <li key={k}>
              {isInstrumentKey(k) ? INSTRUMENTS[k].definition.name : k}
              {k === "psdq_sf" ? ` (only if they ${cfg.psdq_condition.replace(/_/g, " ")})` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">The adjusted wording for a third caregiver is not yet wired into the instrument screens; the four questions below are live.</p>
      </Card>
      {user.couple ? (
        <Card>
          <h2 className="text-lg font-semibold">Four questions</h2>
          <p className="mt-1 text-sm text-muted">Answered by the caregiver in their own words. Saved to the server under your account.</p>
          <ol className="mt-3 divide-y divide-border">
            {cfg.questions.map((q) => (
              <li key={q.id} className="py-3">
                <p className="font-medium">{q.text}</p>
                <AnswerForm action={saveCaregiverAnswer} hidden={{ questionId: q.id }} label="Your answer" initial={answers.find((a) => a.question_id === q.id)?.answer_text ?? ""} keepAfterSave />
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
