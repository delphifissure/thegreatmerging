"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/app/_components/Button";
import { Field, Notice } from "@/app/_components/Field";
import { Toggle } from "@/app/_components/Toggle";
import { idle } from "@/app/_lib/actions";
import { updateConsentAction, updateTherapistEmailAction } from "../actions";

type Field = "share_relationship_scores" | "share_mental_health_scores" | "share_written_answers_verbatim" | "allow_interpreter_to_quote_prior_answers" | "share_profile_with_therapist";

const SWITCHES: Array<{ field: Field; label: string; explain: string }> = [
  { field: "share_relationship_scores", label: "Partner may see my relationship scores", explain: "Your scores on the relationship questionnaires, after both of you have finished." },
  { field: "share_mental_health_scores", label: "Partner may see my PHQ-9, GAD-7 and OCI-R scores", explain: "Off keeps these private to you; they are never used in any couple-level comparison either way." },
  { field: "share_written_answers_verbatim", label: "Written answers I mark shareable may appear word for word", explain: "Otherwise the brief carries the app's summary of what you wrote, never your exact words." },
  { field: "allow_interpreter_to_quote_prior_answers", label: "The app may quote my earlier answers back to me", explain: "Only in follow-up questions shown to you; your partner never sees them." },
  { field: "share_profile_with_therapist", label: "My profile may be shared with a therapist", explain: "By a link you create yourself. The couple brief is included only if both of you switch this on." },
];

export function ConsentSwitches({ values, therapistEmail }: { values: Record<Field, boolean>; therapistEmail: string }) {
  const [state, setState] = useState(values);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailState, emailAction, emailPending] = useActionState(updateTherapistEmailAction, idle);

  const toggle = (field: Field) => {
    const next = !state[field];
    setState((s) => ({ ...s, [field]: next }));
    start(async () => {
      const r = await updateConsentAction({ field, value: next });
      if (!r.ok) {
        setState((s) => ({ ...s, [field]: !next }));
        setError(r.error);
      } else setError(null);
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {SWITCHES.map((s) => (
          <li key={s.field} className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-prose">
              <p id={`${s.field}-label`} className="font-medium">
                {s.label}
              </p>
              <p id={`${s.field}-desc`} className="text-sm text-muted">
                {s.explain}
              </p>
            </div>
            <Toggle checked={state[s.field]} onChange={() => toggle(s.field)} disabled={pending} aria-labelledby={`${s.field}-label`} aria-describedby={`${s.field}-desc`} />
          </li>
        ))}
      </ul>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <form action={emailAction} className="flex flex-wrap items-end gap-3">
        <Field label="Therapist email (optional)" htmlFor="therapist_email" hint="Kept with your settings; used only when you create a share link.">
          <input id="therapist_email" name="therapist_email" type="email" defaultValue={therapistEmail} className="w-full max-w-sm" />
        </Field>
        <Button type="submit" variant="secondary" disabled={emailPending} aria-busy={emailPending}>
          {emailPending ? "Saving…" : "Save email"}
        </Button>
        {!emailState.ok ? <Notice tone="warn">{emailState.error}</Notice> : emailState.message ? <Notice>{emailState.message}</Notice> : null}
      </form>
    </div>
  );
}
