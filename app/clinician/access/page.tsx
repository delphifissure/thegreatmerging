import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { Field } from "@/app/_components/Field";
import { PageHeader } from "@/app/_components/PageHeader";

export const metadata = { title: "Clinician access" };

/**
 * A person grants or revokes a clinician's access to their own profile (section 11a).
 * The clinician must already have an account with role "clinician"; access is granted by that
 * account's identifier, and revocation takes effect immediately and is logged.
 */
export default async function ClinicianAccessPage() {
  const user = await requireUser();
  const links = await data.activeClinicianLinks(user.id);
  const couple = await data.getCoupleForUser(user.id);

  async function grant(formData: FormData) {
    "use server";
    const u = await requireUser();
    const parsed = z.object({ clinician_id: z.string().uuid() }).safeParse({ clinician_id: String(formData.get("clinician_id") ?? "") });
    if (!parsed.success) return;
    const clinician = await data.getUser(parsed.data.clinician_id);
    if (!clinician || clinician.role !== "clinician") return;
    const c = await data.getCoupleForUser(u.id);
    await data.grantClinicianLink({ subjectUserId: u.id, clinicianUserId: clinician.id, coupleId: c?.couple.id ?? null });
    revalidatePath("/clinician/access");
  }

  async function revoke(formData: FormData) {
    "use server";
    const u = await requireUser();
    const linkId = String(formData.get("link_id") ?? "");
    if (!z.string().uuid().safeParse(linkId).success) return;
    await data.revokeClinicianLink({ linkId, subjectUserId: u.id });
    revalidatePath("/clinician/access");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Clinician access" lede={`You decide who can see your profile. Access is per clinician, logged on every read, and ends the moment you revoke it.${couple ? " Your couple's brief is included only if both of you have enabled sharing with a therapist." : ""}`} />
      <Card>
        <form action={grant} className="space-y-3">
          <Field label="Clinician account identifier" htmlFor="clinician_id" hint="Your clinician gives you this identifier from their own account page.">
            <input id="clinician_id" name="clinician_id" className="w-full max-w-md font-mono text-sm" required />
          </Field>
          <Button type="submit">Grant access</Button>
        </form>
      </Card>
      <Card as="section">
        <h2 id="active" className="text-lg font-semibold">
          Active access
        </h2>
        {links.length === 0 ? (
          <p className="text-sm">Nobody has access to your profile.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>Clinician {l.clinician_user_id.slice(0, 8)}… since {l.consent_granted_at.toISOString().slice(0, 10)}</span>
                <form action={revoke}>
                  <input type="hidden" name="link_id" value={l.id} />
                  <Button type="submit" variant="danger">
                    Revoke
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
