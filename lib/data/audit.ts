/**
 * Audit log writes. Every read of one partner's data by another partner, by a job on the
 * couple's behalf, by an export, by a share link, or by a clinician goes through here.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type AuditEntry = {
  actorUserId: string | null;
  actorKind?: "user" | "job" | "share_link" | "clinician" | "researcher" | "system";
  action: string;
  targetUserId?: string | null;
  targetTable?: string;
  targetId?: string | null;
  consentState?: unknown;
  metadata?: Record<string, unknown>;
};

export async function audit(entry: AuditEntry): Promise<void> {
  await db()
    .insert(schema.audit_log)
    .values({
      actor_user_id: entry.actorUserId,
      actor_kind: entry.actorKind ?? "user",
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      consent_state_at_time: entry.consentState ?? null,
      metadata: entry.metadata ?? null,
    });
}

/** The target user's consent row at the time of a cross-user read, for the audit entry. */
export async function consentSnapshot(userId: string, coupleId: string) {
  const rows = await db()
    .select()
    .from(schema.consent_settings)
    .where(and(eq(schema.consent_settings.user_id, userId), eq(schema.consent_settings.couple_id, coupleId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    share_relationship_scores: row.share_relationship_scores,
    share_mental_health_scores: row.share_mental_health_scores,
    share_written_answers_verbatim: row.share_written_answers_verbatim,
    allow_interpreter_to_quote_prior_answers: row.allow_interpreter_to_quote_prior_answers,
    share_profile_with_therapist: row.share_profile_with_therapist,
  };
}

/**
 * Wrap a cross-user read so the audit row is written before the data is returned.
 * Every lib/data function that reads another user's rows uses this.
 */
export async function auditedCrossUserRead<T>(entry: AuditEntry & { targetUserId: string; coupleId?: string }, read: () => Promise<T>): Promise<T> {
  const consentState = entry.coupleId ? await consentSnapshot(entry.targetUserId, entry.coupleId) : entry.consentState ?? null;
  await audit({ ...entry, consentState });
  return read();
}
