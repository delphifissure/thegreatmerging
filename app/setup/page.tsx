import * as data from "@/lib/data";
import { requireAppUser } from "@/app/_lib/session";
import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";
import { ConsentSwitches } from "./_components/ConsentSwitches";
import { CreateCoupleForm, HasChildrenSwitch, InviteForm, NameForm } from "./_components/CoupleForms";
import { SchedulingNotes } from "./_components/SchedulingNotes";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  const user = await requireAppUser();
  const couple = user.couple;
  const [consent, members] = couple ? await Promise.all([data.getConsent(user.id, couple.id), data.listCoupleUsers(couple.id)]) : [null, []];
  const partner = members.find((m) => m.id !== user.id) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup"
        lede="Do this part together, on one device or two. Each of you sees and edits only your own sharing settings."
      />

      <Card>
        <h2 className="text-lg font-semibold">Names and roles</h2>
        <p className="mt-1 text-sm text-muted">
          You are {user.displayName}. {partner ? `Your partner is ${partner.display_name}.` : ""}
        </p>
        <div className="mt-3">
          <NameForm current={user.displayName} />
        </div>
      </Card>

      {!couple ? (
        <Card>
          <h2 className="text-lg font-semibold">Start together</h2>
          <p className="mt-1 text-sm text-muted">One of you starts it and invites the other. If your partner already started, use the invitation link they sent you instead.</p>
          <div className="mt-3">
            <CreateCoupleForm />
          </div>
        </Card>
      ) : null}

      {couple && !couple.partner_b_id ? (
        <Card>
          <h2 className="text-lg font-semibold">Invite your partner</h2>
          {user.side === "a" ? (
            <>
              <p className="mt-1 text-sm text-muted">Enter their email to create a link, then send it to them yourself. The link works for 14 days.</p>
              <div className="mt-3">
                <InviteForm />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Waiting for the person who started the couple to send the invitation.</p>
          )}
        </Card>
      ) : null}

      {couple ? (
        <Card>
          <h2 className="text-lg font-semibold">Children</h2>
          <p className="mt-1 text-sm text-muted">With children in the picture, the part about the two of you adds questionnaires on co-parenting and parenting style.</p>
          <div className="mt-3">
            <HasChildrenSwitch value={couple.has_children} />
          </div>
        </Card>
      ) : null}

      {couple && consent ? (
        <Card>
          <h2 className="text-lg font-semibold">What your partner, and the app, may see</h2>
          <p className="mt-1 text-sm text-muted">These are your switches only; your partner has their own. Every change is one tap and is logged.</p>
          <div className="mt-3">
            <ConsentSwitches
              values={{
                share_relationship_scores: consent.share_relationship_scores,
                share_mental_health_scores: consent.share_mental_health_scores,
                share_written_answers_verbatim: consent.share_written_answers_verbatim,
                allow_interpreter_to_quote_prior_answers: consent.allow_interpreter_to_quote_prior_answers,
                share_profile_with_therapist: consent.share_profile_with_therapist,
              }}
              therapistEmail={consent.therapist_email ?? ""}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Scheduling</h2>
        <p className="mt-1 text-sm text-muted">When will each of you sit down for the two parts? Stored only on this device, as a reminder to yourselves.</p>
        <div className="mt-3">
          <SchedulingNotes />
        </div>
      </Card>

      {couple ? (
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/instruments">Go to the questionnaires</LinkButton>
          <LinkButton href="/extended/caregiver" variant="secondary">
            A third caregiver
          </LinkButton>
          <LinkButton href="/extended/child" variant="secondary">
            Talking with a child
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}
