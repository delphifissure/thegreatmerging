/**
 * Clinician and research layer (section 11a). A clinician is linked to a person by that
 * person's explicit, revocable consent; every clinician read is logged with the consent state
 * at the time; revocation removes access immediately and is logged. Sentiment flags are stored
 * per partner and shown to the clinician only. Outcome reports are de-identified.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { sha256Hex } from "@/lib/hash";
import { audit, auditedCrossUserRead } from "./audit";
import { getConsent } from "./users";

export async function grantClinicianLink(input: { subjectUserId: string; clinicianUserId: string; coupleId: string | null }) {
  const rows = await db()
    .insert(schema.clinician_links)
    .values({ subject_user_id: input.subjectUserId, clinician_user_id: input.clinicianUserId, couple_id: input.coupleId })
    .returning();
  await audit({ actorUserId: input.subjectUserId, action: "clinician.link_grant", targetUserId: input.subjectUserId, targetTable: "clinician_links", targetId: rows[0].id, metadata: { clinician: input.clinicianUserId } });
  return rows[0];
}

export async function revokeClinicianLink(input: { linkId: string; subjectUserId: string }) {
  await db()
    .update(schema.clinician_links)
    .set({ revoked_at: new Date(), updated_at: new Date() })
    .where(and(eq(schema.clinician_links.id, input.linkId), eq(schema.clinician_links.subject_user_id, input.subjectUserId)));
  await audit({ actorUserId: input.subjectUserId, action: "clinician.link_revoke", targetUserId: input.subjectUserId, targetTable: "clinician_links", targetId: input.linkId });
}

export async function activeClinicianLinks(subjectUserId: string) {
  return db()
    .select()
    .from(schema.clinician_links)
    .where(and(eq(schema.clinician_links.subject_user_id, subjectUserId), isNull(schema.clinician_links.revoked_at), isNull(schema.clinician_links.deleted_at)));
}

export async function hasActiveClinicianLink(clinicianUserId: string, subjectUserId: string): Promise<boolean> {
  const rows = await db()
    .select({ id: schema.clinician_links.id })
    .from(schema.clinician_links)
    .where(and(eq(schema.clinician_links.clinician_user_id, clinicianUserId), eq(schema.clinician_links.subject_user_id, subjectUserId), isNull(schema.clinician_links.revoked_at), isNull(schema.clinician_links.deleted_at)))
    .limit(1);
  return rows.length > 0;
}

export async function persistSentimentFlags(input: {
  coupleId: string;
  userId: string;
  flaggerVersion: string;
  flags: Array<{ marker: string; quoted_span: string; confidence: number; source_answer_id: string }>;
}) {
  await db().delete(schema.sentiment_flags).where(and(eq(schema.sentiment_flags.couple_id, input.coupleId), eq(schema.sentiment_flags.user_id, input.userId)));
  if (input.flags.length === 0) return;
  await db()
    .insert(schema.sentiment_flags)
    .values(
      input.flags.map((f) => ({
        couple_id: input.coupleId,
        user_id: input.userId,
        source_answer_id: f.source_answer_id,
        marker: f.marker,
        quoted_span: f.quoted_span,
        confidence: f.confidence,
        flagger_version: input.flaggerVersion,
      })),
    );
}

/** Clinician read of one subject's sentiment flags: requires an active link; audited with consent state. */
export async function sentimentFlagsForClinician(input: { clinicianUserId: string; subjectUserId: string; coupleId: string }) {
  if (!(await hasActiveClinicianLink(input.clinicianUserId, input.subjectUserId))) return [];
  return auditedCrossUserRead(
    { actorUserId: input.clinicianUserId, actorKind: "clinician", action: "clinician.read_sentiment_flags", targetUserId: input.subjectUserId, coupleId: input.coupleId, targetTable: "sentiment_flags", targetId: input.coupleId },
    () => db().select().from(schema.sentiment_flags).where(and(eq(schema.sentiment_flags.user_id, input.subjectUserId), eq(schema.sentiment_flags.couple_id, input.coupleId))),
  );
}

/** Clinician read of a subject's profile and, if both partners consent, the couple's briefs. */
export async function profileForClinician(input: { clinicianUserId: string; subjectUserId: string }) {
  if (!(await hasActiveClinicianLink(input.clinicianUserId, input.subjectUserId))) return null;
  return auditedCrossUserRead(
    { actorUserId: input.clinicianUserId, actorKind: "clinician", action: "clinician.read_profile", targetUserId: input.subjectUserId, targetTable: "profiles", targetId: input.subjectUserId },
    async () => {
      const profile = await db().select().from(schema.profiles).where(eq(schema.profiles.user_id, input.subjectUserId)).limit(1);
      const p = profile[0] ?? null;
      let briefs: Array<typeof schema.briefs.$inferSelect> = [];
      if (p?.couple_id) {
        const couple = await db().select().from(schema.couples).where(eq(schema.couples.id, p.couple_id)).limit(1);
        const c = couple[0];
        if (c?.partner_b_id) {
          const ca = await getConsent(c.partner_a_id, c.id);
          const cb = await getConsent(c.partner_b_id, c.id);
          if (ca.share_profile_with_therapist && cb.share_profile_with_therapist) {
            briefs = await db().select().from(schema.briefs).where(and(eq(schema.briefs.couple_id, c.id), isNull(schema.briefs.deleted_at)));
          }
        }
      }
      return { profile: p, briefs };
    },
  );
}

/** De-identified outcome report (12 and 24 month retakes). The cohort key is a one-way hash of the couple id and a salt. */
export async function recordOutcomeReport(input: {
  coupleId: string;
  monthsSinceBaseline: 12 | 24;
  stillTogether: boolean | null;
  satisfaction: number | null;
  soughtTherapy: boolean | null;
  retakeScores: unknown;
}) {
  const salt = process.env.OUTCOME_COHORT_SALT ?? "the-plan-outcomes";
  const cohortKey = sha256Hex(`${salt}:${input.coupleId}`).slice(0, 24);
  await db().insert(schema.outcome_reports).values({
    cohort_key: cohortKey,
    months_since_baseline: input.monthsSinceBaseline,
    still_together: input.stillTogether,
    satisfaction: input.satisfaction,
    sought_therapy: input.soughtTherapy,
    retake_scores: input.retakeScores,
  });
  await audit({ actorUserId: null, actorKind: "system", action: "outcome.report", targetTable: "outcome_reports", targetId: cohortKey, metadata: { months: input.monthsSinceBaseline } });
}
