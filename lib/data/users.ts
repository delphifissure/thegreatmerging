/**
 * Users, couples, invitations, consent. Consent changes are logged per field and mirrored
 * into audit_log (section 3: "Changes are logged").
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { hashToken, randomToken } from "@/lib/hash";
import { audit } from "./audit";

export type ConsentPatch = Partial<{
  share_relationship_scores: boolean;
  share_mental_health_scores: boolean;
  share_written_answers_verbatim: boolean;
  allow_interpreter_to_quote_prior_answers: boolean;
  share_profile_with_therapist: boolean;
  therapist_email: string | null;
}>;

export const CONSENT_FIELDS = [
  "share_relationship_scores",
  "share_mental_health_scores",
  "share_written_answers_verbatim",
  "allow_interpreter_to_quote_prior_answers",
  "share_profile_with_therapist",
  "therapist_email",
] as const;

export async function ensureUser(input: { id: string; displayName: string; role?: "partner" | "caregiver" | "child_proxy" | "clinician" | "researcher" }) {
  const rows = await db()
    .insert(schema.users)
    .values({ id: input.id, auth_provider_id: input.id, display_name: input.displayName, role: input.role ?? "partner" })
    .onConflictDoUpdate({ target: schema.users.id, set: { display_name: input.displayName, updated_at: new Date() } })
    .returning();
  return rows[0];
}

export type UserRow = typeof schema.users.$inferSelect;
export type CoupleRow = typeof schema.couples.$inferSelect;

export async function getUser(id: string): Promise<UserRow | null> {
  const rows = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCouple(input: { partnerAId: string; hasChildren: boolean }) {
  const rows = await db()
    .insert(schema.couples)
    .values({ partner_a_id: input.partnerAId, has_children: input.hasChildren, status: "invited" })
    .returning();
  const couple = rows[0];
  await getConsent(input.partnerAId, couple.id);
  await audit({ actorUserId: input.partnerAId, action: "couple.create", targetTable: "couples", targetId: couple.id });
  return couple;
}

export async function getCouple(coupleId: string): Promise<CoupleRow | null> {
  const rows = await db().select().from(schema.couples).where(and(eq(schema.couples.id, coupleId), isNull(schema.couples.deleted_at))).limit(1);
  return rows[0] ?? null;
}

/** Read-only preview of an invitation for the accept screen: who invited, which role, whether it is still valid. */
export async function getInvitationByToken(token: string): Promise<{ inviter_name: string; role: "partner_a" | "partner_b" | "caregiver" | "child_proxy"; has_children: boolean; valid: boolean; reason: string | null } | null> {
  const rows = await db().select().from(schema.invitations).where(eq(schema.invitations.token_hash, hashToken(token))).limit(1);
  const inv = rows[0];
  if (!inv) return null;
  const inviter = await getUser(inv.invited_by);
  const couple = await getCouple(inv.couple_id);
  const reason = inv.accepted_at ? "already accepted" : inv.expires_at.getTime() < Date.now() ? "expired" : !couple ? "couple not found" : null;
  return { inviter_name: inviter?.display_name ?? "Your partner", role: inv.role, has_children: couple?.has_children ?? false, valid: reason === null, reason };
}

export async function updateCouple(coupleId: string, patch: { has_children?: boolean; status?: "invited" | "active" | "closed" }) {
  const rows = await db().update(schema.couples).set({ ...patch, updated_at: new Date() }).where(eq(schema.couples.id, coupleId)).returning();
  return rows[0];
}

/** The couple a user belongs to as a partner (or as a caregiver / child proxy member). */
export async function getCoupleForUser(userId: string) {
  const asPartner = await db()
    .select()
    .from(schema.couples)
    .where(and(isNull(schema.couples.deleted_at), or(eq(schema.couples.partner_a_id, userId), eq(schema.couples.partner_b_id, userId))))
    .limit(1);
  if (asPartner[0]) return { couple: asPartner[0], side: asPartner[0].partner_a_id === userId ? ("a" as const) : ("b" as const), role: "partner" as const };
  const asMember = await db()
    .select({ couple: schema.couples, role: schema.couple_members.role })
    .from(schema.couple_members)
    .innerJoin(schema.couples, eq(schema.couples.id, schema.couple_members.couple_id))
    .where(and(eq(schema.couple_members.user_id, userId), isNull(schema.couple_members.deleted_at)))
    .limit(1);
  if (asMember[0]) return { couple: asMember[0].couple, side: null, role: asMember[0].role };
  return null;
}

export function partnerSide(couple: { partner_a_id: string; partner_b_id: string | null }, userId: string): "a" | "b" | null {
  if (couple.partner_a_id === userId) return "a";
  if (couple.partner_b_id === userId) return "b";
  return null;
}

export function otherPartnerId(couple: { partner_a_id: string; partner_b_id: string | null }, userId: string): string | null {
  if (couple.partner_a_id === userId) return couple.partner_b_id;
  if (couple.partner_b_id === userId) return couple.partner_a_id;
  return null;
}

export async function createInvitation(input: { coupleId: string; invitedBy: string; email: string; role?: "partner_b" | "caregiver" }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  await db().insert(schema.invitations).values({
    couple_id: input.coupleId,
    invited_by: input.invitedBy,
    email: input.email.trim().toLowerCase(),
    role: input.role ?? "partner_b",
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });
  await audit({ actorUserId: input.invitedBy, action: "invitation.create", targetTable: "invitations", targetId: input.coupleId, metadata: { role: input.role ?? "partner_b" } });
  return { token, expiresAt };
}

export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationError";
  }
}

/** Accept by raw token. Runs as the service role: the invitee cannot see the invitation row under RLS. */
export async function acceptInvitation(input: { token: string; userId: string }) {
  const rows = await db().select().from(schema.invitations).where(eq(schema.invitations.token_hash, hashToken(input.token))).limit(1);
  const inv = rows[0];
  if (!inv) throw new InvitationError("invitation not found");
  if (inv.accepted_at) throw new InvitationError("invitation already accepted");
  if (inv.expires_at.getTime() < Date.now()) throw new InvitationError("invitation expired");
  const couple = await getCouple(inv.couple_id);
  if (!couple) throw new InvitationError("couple not found");
  if (couple.partner_a_id === input.userId) throw new InvitationError("you cannot accept your own invitation");
  if (inv.role === "partner_b") {
    if (couple.partner_b_id && couple.partner_b_id !== input.userId) throw new InvitationError("this couple already has a second partner");
    await db().update(schema.couples).set({ partner_b_id: input.userId, status: "active", updated_at: new Date() }).where(eq(schema.couples.id, couple.id));
  } else {
    await db()
      .insert(schema.couple_members)
      .values({ couple_id: couple.id, user_id: input.userId, role: inv.role })
      .onConflictDoNothing();
  }
  await db().update(schema.invitations).set({ accepted_at: new Date(), accepted_by: input.userId, updated_at: new Date() }).where(eq(schema.invitations.id, inv.id));
  await getConsent(input.userId, couple.id);
  await audit({ actorUserId: input.userId, action: "invitation.accept", targetUserId: inv.invited_by, targetTable: "couples", targetId: couple.id, metadata: { role: inv.role } });
  return (await getCouple(couple.id))!;
}

/** Consent row for a user in a couple; created with the private-by-default settings if missing. */
export async function getConsent(userId: string, coupleId: string) {
  const rows = await db()
    .insert(schema.consent_settings)
    .values({ user_id: userId, couple_id: coupleId })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];
  const existing = await db()
    .select()
    .from(schema.consent_settings)
    .where(and(eq(schema.consent_settings.user_id, userId), eq(schema.consent_settings.couple_id, coupleId)))
    .limit(1);
  return existing[0];
}

export async function updateConsent(userId: string, coupleId: string, patch: ConsentPatch) {
  const before = await getConsent(userId, coupleId);
  const changes: Array<{ field: string; old: unknown; new: unknown }> = [];
  for (const field of CONSENT_FIELDS) {
    if (!(field in patch)) continue;
    const next = patch[field];
    if (next === undefined) continue;
    if (before[field] !== next) changes.push({ field, old: before[field], new: next });
  }
  if (changes.length === 0) return before;
  const rows = await db()
    .update(schema.consent_settings)
    .set({ ...patch, updated_at: new Date() })
    .where(and(eq(schema.consent_settings.user_id, userId), eq(schema.consent_settings.couple_id, coupleId)))
    .returning();
  for (const c of changes) {
    await db().insert(schema.consent_changes).values({ user_id: userId, couple_id: coupleId, field: c.field, old_value: c.old as never, new_value: c.new as never });
    await audit({ actorUserId: userId, action: "consent.change", targetUserId: userId, targetTable: "consent_settings", targetId: coupleId, metadata: c });
  }
  return rows[0];
}

export async function listCoupleUsers(coupleId: string) {
  const couple = await getCouple(coupleId);
  if (!couple) return [];
  const ids = [couple.partner_a_id, couple.partner_b_id].filter((x): x is string => !!x);
  const out: Array<{ id: string; display_name: string; side: "a" | "b" }> = [];
  for (const id of ids) {
    const u = await getUser(id);
    if (u) out.push({ id: u.id, display_name: u.display_name, side: id === couple.partner_a_id ? "a" : "b" });
  }
  return out;
}
