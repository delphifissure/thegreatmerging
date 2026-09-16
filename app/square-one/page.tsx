import * as data from "@/lib/data";
import squareOne from "@/config/square_one.json";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { QuestionNote } from "./QuestionNote";
import { RequirementsForm } from "./RequirementsForm";

export default async function SquareOnePage() {
  const user = await requireAppUser();
  const { notes, requirements } = await data.getSquareOne(user.id);
  const noteFor = (i: number) => notes.find((n) => n.question_index === i);
  return (
    <div className="space-y-6">
      <PageHeader title="Square One" lede={squareOne.intro} />
      <Card>
        <p className="text-sm text-muted">A private notebook. Nothing here is scored, sent to a model, or shared with anyone.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {squareOne.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Your requirements list</h2>
        <p className="mt-1 text-sm text-muted">{squareOne.requirements_prompt}</p>
        <div className="mt-3">
          <RequirementsForm initial={requirements} count={squareOne.requirements_count} />
        </div>
      </Card>
      {squareOne.tiers.map((tier) => (
        <Card key={tier.id} as="section">
          <h2 className="text-lg font-semibold">{tier.title}</h2>
          <ol className="divide-y divide-border">
            {tier.questions.map((q) => (
              <QuestionNote
                key={q.index}
                index={q.index}
                text={q.text}
                listenFor={q.listen_for}
                eyebrowLabel={squareOne.eyebrow_label}
                initialNotes={noteFor(q.index)?.notes ?? ""}
                initialEyebrow={noteFor(q.index)?.raised_eyebrow ?? false}
              />
            ))}
          </ol>
        </Card>
      ))}
      <Card>
        <h2 className="text-lg font-semibold">{squareOne.observe.title}</h2>
        <p className="mt-1 text-sm text-muted">{squareOne.observe.intro}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {squareOne.observe.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">{squareOne.reading.title}</h2>
        <div className="mt-2 space-y-2">
          {squareOne.reading.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Card>
    </div>
  );
}
