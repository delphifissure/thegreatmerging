import Link from "next/link";
import * as data from "@/lib/data";
import { requireAppUser } from "@/app/_lib/session";
import { parseProfile } from "@/app/_lib/results";
import { Card, GeneratedLabel, UnvalidatedLabel } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { Button } from "@/app/_components/Button";
import { Notice } from "@/app/_components/Field";
import { Waiting } from "@/app/_components/Waiting";
import { dismissSafetyNote, revokeShare } from "./actions";
import { ExportButtons } from "./_components/ExportButtons";
import { ExportList } from "./_components/ExportList";
import { ShareForm } from "./_components/ShareForm";

export const metadata = { title: "Your individual profile" };

type ShareView = { id: string; email: string; status: string; active: boolean };

/** Share rows with their status computed once, outside render. */
async function shareViews(userId: string): Promise<ShareView[]> {
  const now = Date.now();
  return (await data.listTherapistShares(userId)).map((s) => {
    const active = !s.revoked_at && s.expires_at.getTime() > now;
    const status = s.revoked_at ? "revoked" : s.expires_at.getTime() <= now ? "expired" : `active until ${s.expires_at.toISOString().slice(0, 16).replace("T", " ")}`;
    const extra = `${s.include_brief ? " (includes the couple brief)" : ""}${s.last_accessed_at ? `, last opened ${s.last_accessed_at.toISOString().slice(0, 10)}` : ""}`;
    return { id: s.id, email: s.email, status: `${status}${extra}`, active };
  });
}

export default async function ProfilePage() {
  const user = await requireAppUser();
  const [row, shares] = await Promise.all([data.getProfile(user.id), shareViews(user.id)]);
  const profile = row?.content ? parseProfile(row.content) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Your individual profile" lede="Owned by you. It contains no partner data. Share it only if and when you choose." />

      {row?.safety_note ? (
        <Card className="border-warn-border">
          <h2 className="text-lg font-semibold">A note for you</h2>
          <p className="mt-2">{row.safety_note}</p>
          <form action={dismissSafetyNote} className="mt-3">
            <Button type="submit" variant="secondary">
              Dismiss this note
            </Button>
          </form>
        </Card>
      ) : null}

      {!profile ? (
        <Waiting title="Your profile has not been generated yet." refresh={false}>
          It is created once your answers have been read.{" "}
          <Link href="/waiting" className="underline">
            Where you both are
          </Link>
        </Waiting>
      ) : (
        <>
          <Card>
            <p className="text-sm">
              <strong>Validated:</strong> {profile.labels.validated}
            </p>
            <p className="mt-1 text-sm">
              <strong>Generated:</strong> {profile.labels.generated}
            </p>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Scores from published questionnaires</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col">Instrument</th>
                    <th scope="col">Subscale</th>
                    <th scope="col">Value</th>
                    <th scope="col">Cutoff</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.validated_scores.map((s) => (
                    <tr key={`${s.instrument_key}:${s.subscale}`}>
                      <td>
                        {s.name}
                        {s.unvalidated ? <UnvalidatedLabel /> : null}
                      </td>
                      <td>{s.subscale.replace(/_/g, " ")}</td>
                      <td>{Number.isInteger(s.value) ? s.value : s.value.toFixed(2)}</td>
                      <td>{s.cutoff_label ? s.cutoff_label.replace(/_/g, " ") : "no published cutoff"}</td>
                      <td className="text-xs">{s.source_citation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">In plain words</h2>
            <GeneratedLabel />
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {profile.generated_sentences.map((s) => (
                <li key={s.instrument_key}>{s.sentence}</li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Your tags</h2>
            {profile.tags.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None yet. Tags come from the questions in your own words.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {profile.tags.map((t) => (
                  <li key={`${t.domain}:${t.item_ref}`}>
                    <span className="text-muted">{t.domain.replace(/_/g, " ")}, {t.item_ref}:</span> {t.tag}. {t.comment}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm italic">This profile contains no partner data.</p>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Share with a therapist</h2>
            <p className="mt-1 text-sm text-muted">
              The couple brief is included only if both of you switched on &ldquo;My profile may be shared with a therapist&rdquo; in setup. Otherwise the link carries your profile alone.
            </p>
            <div className="mt-3">
              <ShareForm />
            </div>
            {shares.length > 0 ? (
              <ul className="mt-4 space-y-2 text-sm">
                {shares.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2">
                    <span>
                      {s.email}: {s.status}
                    </span>
                    {s.active ? (
                      <form action={revokeShare}>
                        <input type="hidden" name="shareId" value={s.id} />
                        <Button type="submit" variant="danger">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Export</h2>
            <p className="mt-1 text-sm text-muted">Scores carry the questionnaire they came from. Anything the app wrote is marked as such.</p>
            <div className="mt-3">
              <ExportButtons kind="profile" />
            </div>
            <ExportList coupleId={null} userId={user.id} kinds={["profile"]} />
          </Card>
        </>
      )}
      {!profile ? <Notice>Once your answers have been read, this page lists your scores with their sources and lets you share or export the profile.</Notice> : null}
    </div>
  );
}
