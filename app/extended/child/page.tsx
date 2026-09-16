import * as data from "@/lib/data";
import extended from "@/config/extended.json";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Notice } from "@/app/_components/Field";
import { AnswerForm } from "../AnswerForm";
import { saveChildAnswer } from "../actions";

export default async function ChildConversationPage() {
  const user = await requireAppUser();
  const cfg = extended.child;
  const answers = user.couple ? await data.listChildConversationAnswers(user.couple.id) : [];
  const forQuestion = (id: string) => answers.filter((a) => a.question_id === id);
  return (
    <div className="space-y-6">
      <PageHeader title={cfg.title} lede={cfg.intro} />
      {!user.couple ? <Notice>Create or join a couple first.</Notice> : null}
      <Card>
        <p className="text-sm">
          Run this at the table, with the child present and both adults there. Read each question aloud, listen, and type what the child says in their words. It is a conversation, never a form the child fills in.
        </p>
      </Card>
      {user.couple ? (
        <ol className="space-y-4">
          {cfg.questions.map((q, i) => {
            const pin = "pin_to_plan" in q && q.pin_to_plan === true;
            return (
              <Card key={q.id} as="article">
                <p className="text-xs uppercase text-muted">Question {i + 1}</p>
                <h2 className="text-lg font-medium">{q.text}</h2>
                {pin ? <p className="mt-1 text-sm text-muted">The adults answer this one too; both answers are also pinned to the plan.</p> : null}
                {forQuestion(q.id).length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {forQuestion(q.id).map((a) => (
                      <li key={a.id}>
                        <span className="text-muted">Child, {a.created_at.toISOString().slice(0, 10)}:</span> {a.answer_text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <AnswerForm action={saveChildAnswer} hidden={{ questionId: q.id, who: "child" }} label="What the child said" submitLabel="Save the child's answer" />
                {q.adults_answer_too ? (
                  <>
                    {forQuestion(`${q.id}_adults`).length > 0 ? (
                      <ul className="mt-3 space-y-1 text-sm">
                        {forQuestion(`${q.id}_adults`).map((a) => (
                          <li key={a.id}>
                            <span className="text-muted">Adults, {a.created_at.toISOString().slice(0, 10)}:</span> {a.answer_text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <AnswerForm action={saveChildAnswer} hidden={{ questionId: q.id, who: "adults" }} label="The adults' answer" submitLabel="Save the adults' answer" />
                  </>
                ) : null}
              </Card>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
