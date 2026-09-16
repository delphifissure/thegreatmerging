/**
 * Briefs, plans (versioned), revisits, exports, therapist shares.
 */
import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { hashToken, randomToken } from "@/lib/hash";
import type { Domain } from "@/instruments/schema";
import { audit, auditedCrossUserRead } from "./audit";
import { getConsent, getCouple } from "./users";

export type PlanItem = {
  domain: Domain;
  topic: string;
  agreed: string;
  a_does: string;
  b_does: string;
  revisit_date: string | null;
  status: "active" | "parked" | "closed";
  /** Tags from each partner for the underlying item, when the item came from the brief. */
  item_ref?: string;
  a_tag?: "requirement" | "preference" | null;
  b_tag?: "requirement" | "preference" | null;
  pinned?: boolean;
};

export type ParentingLines = {
  children_questioning_adults: string;
  who_corrects_and_how: string;
  structure_vs_freedom: string;
  language_and_modeling_standard: string;
  adults_disagreeing_in_front_of_child: string;
};

export async function persistBrief(input: { coupleId: string; runId: string | null; domain: Domain; content: unknown; version: string; inputHash: string }) {
  await db().delete(schema.briefs).where(and(eq(schema.briefs.couple_id, input.coupleId), eq(schema.briefs.domain, input.domain)));
  const rows = await db()
    .insert(schema.briefs)
    .values({ couple_id: input.coupleId, run_id: input.runId, domain: input.domain, content: input.content, interpreter_version: input.version, input_hash: input.inputHash })
    .returning();
  return rows[0];
}

export async function getBriefs(coupleId: string) {
  return db().select().from(schema.briefs).where(and(eq(schema.briefs.couple_id, coupleId), isNull(schema.briefs.deleted_at)));
}

export async function setBriefCaregiverVisible(coupleId: string, visible: boolean) {
  await db().update(schema.briefs).set({ caregiver_visible: visible, updated_at: new Date() }).where(and(eq(schema.briefs.couple_id, coupleId), eq(schema.briefs.domain, "parenting")));
}

export async function getLatestPlan(coupleId: string) {
  const rows = await db()
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.couple_id, coupleId), isNull(schema.plans.deleted_at)))
    .orderBy(desc(schema.plans.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPlanVersions(coupleId: string) {
  return db()
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.couple_id, coupleId), isNull(schema.plans.deleted_at)))
    .orderBy(asc(schema.plans.version));
}

/** Every save creates a new version. Revisits are (re)created for dated active items. */
export async function savePlanVersion(input: { coupleId: string; createdBy: string; items: PlanItem[]; parentingLines: ParentingLines | null }) {
  const latest = await getLatestPlan(input.coupleId);
  const version = (latest?.version ?? 0) + 1;
  const rows = await db()
    .insert(schema.plans)
    .values({ couple_id: input.coupleId, version, items: input.items, parenting_lines: input.parentingLines, created_by: input.createdBy })
    .returning();
  const plan = rows[0];
  const revisitRows = input.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === "active" && item.revisit_date)
    .map(({ item, index }) => ({ plan_id: plan.id, couple_id: input.coupleId, item_index: index, due_date: item.revisit_date! }));
  if (revisitRows.length) await db().insert(schema.revisits).values(revisitRows);
  await audit({ actorUserId: input.createdBy, action: "plan.save", targetTable: "plans", targetId: plan.id, metadata: { version } });
  return plan;
}

export async function getDueRevisits(coupleId: string, onOrBefore: string) {
  const plan = await getLatestPlan(coupleId);
  if (!plan) return [];
  return db()
    .select()
    .from(schema.revisits)
    .where(and(eq(schema.revisits.plan_id, plan.id), lte(schema.revisits.due_date, onOrBefore), isNull(schema.revisits.completed_at)));
}

export async function listRevisits(coupleId: string) {
  const plan = await getLatestPlan(coupleId);
  if (!plan) return [];
  return db().select().from(schema.revisits).where(eq(schema.revisits.plan_id, plan.id)).orderBy(asc(schema.revisits.due_date));
}

export async function completeRevisit(input: { revisitId: string; userId: string; outcome: "still_true" | "changed" | "removed"; notes: string | null }) {
  await db()
    .update(schema.revisits)
    .set({ outcome: input.outcome, notes: input.notes, completed_at: new Date(), updated_at: new Date() })
    .where(eq(schema.revisits.id, input.revisitId));
  await audit({ actorUserId: input.userId, action: "revisit.complete", targetTable: "revisits", targetId: input.revisitId, metadata: { outcome: input.outcome } });
}

export async function markReminderSent(revisitId: string) {
  await db().update(schema.revisits).set({ reminder_sent_at: new Date() }).where(eq(schema.revisits.id, revisitId));
}

export async function recordExport(input: { coupleId: string | null; userId: string | null; kind: "brief" | "plan" | "profile"; format: "md" | "pdf"; storagePath: string; createdBy: string | null }) {
  const rows = await db()
    .insert(schema.exports)
    .values({ couple_id: input.coupleId, user_id: input.userId, kind: input.kind, format: input.format, storage_path: input.storagePath, created_by: input.createdBy })
    .returning();
  await audit({ actorUserId: input.createdBy, actorKind: input.createdBy ? "user" : "job", action: `export.${input.kind}.${input.format}`, targetTable: "exports", targetId: rows[0].id, targetUserId: input.userId });
  return rows[0];
}

// ---- Therapist sharing (section 8) ----

export async function createTherapistShare(input: { userId: string; coupleId: string | null; email: string; ttlHours?: number }) {
  const token = randomToken(32);
  const consent = input.coupleId ? await getConsent(input.userId, input.coupleId) : null;
  let includeBrief = false;
  if (input.coupleId && consent?.share_profile_with_therapist) {
    const couple = await getCouple(input.coupleId);
    if (couple?.partner_b_id) {
      const other = couple.partner_a_id === input.userId ? couple.partner_b_id : couple.partner_a_id;
      const otherConsent = await getConsent(other, input.coupleId);
      includeBrief = !!otherConsent.share_profile_with_therapist;
    }
  }
  const rows = await db()
    .insert(schema.therapist_shares)
    .values({
      user_id: input.userId,
      couple_id: input.coupleId,
      email: input.email.trim().toLowerCase(),
      token_hash: hashToken(token),
      include_brief: includeBrief,
      expires_at: new Date(Date.now() + (input.ttlHours ?? 72) * 3600 * 1000),
    })
    .returning();
  await db()
    .update(schema.profiles)
    .set({ shared_with: [{ email: input.email.trim().toLowerCase(), shared_at: new Date().toISOString(), revoked_at: null, share_id: rows[0].id }] as never, updated_at: new Date() })
    .where(eq(schema.profiles.user_id, input.userId));
  await audit({ actorUserId: input.userId, action: "profile.share_create", targetUserId: input.userId, targetTable: "therapist_shares", targetId: rows[0].id, consentState: consent, metadata: { include_brief: includeBrief } });
  return { share: rows[0], token };
}

export async function revokeTherapistShare(input: { shareId: string; userId: string }) {
  await db()
    .update(schema.therapist_shares)
    .set({ revoked_at: new Date(), updated_at: new Date() })
    .where(and(eq(schema.therapist_shares.id, input.shareId), eq(schema.therapist_shares.user_id, input.userId)));
  await audit({ actorUserId: input.userId, action: "profile.share_revoke", targetUserId: input.userId, targetTable: "therapist_shares", targetId: input.shareId });
}

export async function listTherapistShares(userId: string) {
  return db().select().from(schema.therapist_shares).where(eq(schema.therapist_shares.user_id, userId)).orderBy(desc(schema.therapist_shares.created_at));
}

/** Resolve a share token. Every access is logged as a share-link read of the owner's profile. */
export async function resolveTherapistShare(token: string) {
  const rows = await db().select().from(schema.therapist_shares).where(eq(schema.therapist_shares.token_hash, hashToken(token))).limit(1);
  const share = rows[0];
  if (!share) return null;
  if (share.revoked_at || share.expires_at.getTime() < Date.now()) return null;
  return auditedCrossUserRead(
    { actorUserId: null, actorKind: "share_link", action: "profile.share_access", targetUserId: share.user_id, coupleId: share.couple_id ?? undefined, targetTable: "profiles", targetId: share.id, metadata: { email: share.email } },
    async () => {
      await db().update(schema.therapist_shares).set({ last_accessed_at: new Date() }).where(eq(schema.therapist_shares.id, share.id));
      const profile = await db().select().from(schema.profiles).where(eq(schema.profiles.user_id, share.user_id)).limit(1);
      const briefs = share.include_brief && share.couple_id ? await getBriefs(share.couple_id) : [];
      return { share, profile: profile[0] ?? null, briefs };
    },
  );
}
