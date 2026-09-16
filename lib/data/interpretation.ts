/**
 * Interpretation runs, scores, couple scores, flags, interpreter output, private results,
 * and individual profiles. Mental-health scores are encrypted at rest. Partner reads of
 * scores are consent-gated here (the same rule RLS enforces for direct reads) and audited.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decryptNumber, encryptNumber } from "@/lib/crypto";
import { isMentalHealthKey } from "@/instruments/registry";
import type { Score } from "@/instruments/schema";
import type { Stage1Output } from "@/lib/interpretation/stage1";
import { audit, auditedCrossUserRead } from "./audit";
import { getConsent, getCouple } from "./users";

export async function createOrGetRun(input: { coupleId: string; inputHash: string; rulesVersion: string }) {
  const existing = await db()
    .select()
    .from(schema.interpretation_runs)
    .where(and(eq(schema.interpretation_runs.couple_id, input.coupleId), eq(schema.interpretation_runs.input_hash, input.inputHash), isNull(schema.interpretation_runs.deleted_at)))
    .orderBy(desc(schema.interpretation_runs.created_at))
    .limit(1);
  if (existing[0]) return { run: existing[0], created: false };
  const rows = await db()
    .insert(schema.interpretation_runs)
    .values({ couple_id: input.coupleId, input_hash: input.inputHash, rules_version: input.rulesVersion, status: "running" })
    .returning();
  return { run: rows[0], created: true };
}

export async function markRun(runId: string, patch: { status: "pending" | "running" | "complete" | "failed"; error?: string | null; interpreter_version?: string; distress_context?: boolean }) {
  await db()
    .update(schema.interpretation_runs)
    .set({ ...patch, completed_at: patch.status === "complete" ? new Date() : null, updated_at: new Date() })
    .where(eq(schema.interpretation_runs.id, runId));
}

export async function getLatestRun(coupleId: string) {
  const rows = await db()
    .select()
    .from(schema.interpretation_runs)
    .where(and(eq(schema.interpretation_runs.couple_id, coupleId), isNull(schema.interpretation_runs.deleted_at)))
    .orderBy(desc(schema.interpretation_runs.created_at))
    .limit(1);
  return rows[0] ?? null;
}

/** Idempotent: replaces this run's scores, couple scores and flags. */
export async function persistStage1(input: { runId: string; coupleId: string; aId: string; bId: string; output: Stage1Output }) {
  const d = db();
  await d.delete(schema.scores).where(eq(schema.scores.run_id, input.runId));
  await d.delete(schema.couple_scores).where(eq(schema.couple_scores.run_id, input.runId));
  await d.delete(schema.flags).where(eq(schema.flags.run_id, input.runId));

  const scoreRows = (userId: string, scores: Score[]) =>
    scores.map((s) => {
      const mental = isMentalHealthKey(s.instrument_key);
      return {
        run_id: input.runId,
        user_id: userId,
        couple_id: input.coupleId,
        instrument_key: s.instrument_key,
        subscale: s.subscale,
        value: mental ? null : s.value,
        value_enc: mental ? encryptNumber(s.value, { user_id: userId, instrument_key: s.instrument_key, field: s.subscale }) : null,
        cutoff_label: s.cutoff_label,
        unvalidated: s.unvalidated ?? false,
        scoring_version: s.scoring_version,
      };
    });
  const allScores = [...scoreRows(input.aId, input.output.scores.a), ...scoreRows(input.bId, input.output.scores.b)];
  if (allScores.length) await d.insert(schema.scores).values(allScores);
  if (input.output.couple_scores.length) {
    await d.insert(schema.couple_scores).values(
      input.output.couple_scores.map((c) => ({
        run_id: input.runId,
        couple_id: input.coupleId,
        metric: c.metric,
        value: c.value,
        details: c.details,
        unvalidated: c.unvalidated ?? false,
      })),
    );
  }
  if (input.output.flags.length) {
    await d.insert(schema.flags).values(
      input.output.flags.map((f) => ({
        run_id: input.runId,
        couple_id: input.coupleId,
        domain: f.domain,
        rule_key: f.rule_key,
        label: f.label ?? null,
        triggered_by: f.triggered_by,
        weight: f.weight,
      })),
    );
  }
}

export async function persistInterpretation(input: { runId: string; coupleId: string; content: unknown; version: string; inputHash: string }) {
  await db().delete(schema.interpretations).where(eq(schema.interpretations.run_id, input.runId));
  await db().insert(schema.interpretations).values({
    run_id: input.runId,
    couple_id: input.coupleId,
    content: input.content,
    interpreter_version: input.version,
    input_hash: input.inputHash,
  });
}

export async function persistPrivateResults(input: { runId: string; coupleId: string; userId: string; content: unknown }) {
  await db()
    .insert(schema.private_results)
    .values({ run_id: input.runId, couple_id: input.coupleId, user_id: input.userId, content: input.content })
    .onConflictDoUpdate({ target: [schema.private_results.run_id, schema.private_results.user_id], set: { content: input.content, updated_at: new Date() } });
}

export async function persistProfile(input: { userId: string; coupleId: string; content: unknown }) {
  await db()
    .insert(schema.profiles)
    .values({ user_id: input.userId, couple_id: input.coupleId, content: input.content, generated_at: new Date() })
    .onConflictDoUpdate({ target: schema.profiles.user_id, set: { couple_id: input.coupleId, content: input.content, generated_at: new Date(), updated_at: new Date() } });
}

function rowToScore(r: typeof schema.scores.$inferSelect): Score {
  const mental = isMentalHealthKey(r.instrument_key);
  return {
    instrument_key: r.instrument_key,
    subscale: r.subscale,
    value: mental ? decryptNumber(r.value_enc!, { user_id: r.user_id, instrument_key: r.instrument_key, field: r.subscale }) : r.value!,
    cutoff_label: r.cutoff_label,
    scoring_version: r.scoring_version,
    ...(r.unvalidated ? { unvalidated: true } : {}),
  };
}

/** A user's own scores from the latest run. */
export async function getOwnScores(userId: string, coupleId: string): Promise<Score[]> {
  const run = await getLatestRun(coupleId);
  if (!run) return [];
  const rows = await db()
    .select()
    .from(schema.scores)
    .where(and(eq(schema.scores.run_id, run.id), eq(schema.scores.user_id, userId)));
  return rows.map(rowToScore);
}

/**
 * The partner's scores as the viewer is allowed to see them: relationship instruments only when
 * the partner shares relationship scores; mental-health instruments only when the partner shares
 * those. Every call writes an audit row with the consent state at the time.
 */
export async function getPartnerScoresForViewer(viewerId: string, coupleId: string): Promise<Score[]> {
  const couple = await getCouple(coupleId);
  if (!couple || !couple.partner_b_id) return [];
  const partnerId = couple.partner_a_id === viewerId ? couple.partner_b_id : couple.partner_a_id === viewerId || couple.partner_b_id === viewerId ? couple.partner_a_id : null;
  if (!partnerId || partnerId === viewerId) return [];
  const consent = await getConsent(partnerId, coupleId);
  return auditedCrossUserRead(
    { actorUserId: viewerId, action: "scores.read_partner", targetUserId: partnerId, coupleId, targetTable: "scores", targetId: coupleId },
    async () => {
      const run = await getLatestRun(coupleId);
      if (!run) return [];
      const rows = await db()
        .select()
        .from(schema.scores)
        .where(and(eq(schema.scores.run_id, run.id), eq(schema.scores.user_id, partnerId)));
      return rows
        .filter((r) => (isMentalHealthKey(r.instrument_key) ? consent.share_mental_health_scores : consent.share_relationship_scores))
        .map(rowToScore);
    },
  );
}

/** Both partners' scores for a job, mental-health values decrypted only inside the caller's step. */
export async function getScoresForJob(runId: string, userIds: string[], jobName: string): Promise<Record<string, Score[]>> {
  for (const id of userIds) {
    await audit({ actorUserId: null, actorKind: "job", action: `${jobName}.read_scores`, targetUserId: id, targetTable: "scores", targetId: runId });
  }
  const rows = await db()
    .select()
    .from(schema.scores)
    .where(and(eq(schema.scores.run_id, runId), inArray(schema.scores.user_id, userIds)));
  const out: Record<string, Score[]> = {};
  for (const r of rows) (out[r.user_id] ??= []).push(rowToScore(r));
  return out;
}

export async function getFlags(coupleId: string, runId?: string) {
  const run = runId ? { id: runId } : await getLatestRun(coupleId);
  if (!run) return [];
  return db().select().from(schema.flags).where(eq(schema.flags.run_id, run.id));
}

export async function getCoupleScores(coupleId: string, runId?: string) {
  const run = runId ? { id: runId } : await getLatestRun(coupleId);
  if (!run) return [];
  return db().select().from(schema.couple_scores).where(eq(schema.couple_scores.run_id, run.id));
}

export async function getInterpretation(coupleId: string) {
  const run = await getLatestRun(coupleId);
  if (!run) return null;
  const rows = await db().select().from(schema.interpretations).where(eq(schema.interpretations.run_id, run.id)).limit(1);
  return rows[0] ?? null;
}

export async function getPrivateResults(userId: string, coupleId: string) {
  const run = await getLatestRun(coupleId);
  if (!run) return null;
  const rows = await db()
    .select()
    .from(schema.private_results)
    .where(and(eq(schema.private_results.run_id, run.id), eq(schema.private_results.user_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function markPrivateResultsViewed(userId: string, coupleId: string) {
  const run = await getLatestRun(coupleId);
  if (!run) return;
  await db()
    .update(schema.private_results)
    .set({ viewed_at: new Date(), updated_at: new Date() })
    .where(and(eq(schema.private_results.run_id, run.id), eq(schema.private_results.user_id, userId), isNull(schema.private_results.viewed_at)));
}

export async function getProfile(userId: string) {
  const rows = await db().select().from(schema.profiles).where(eq(schema.profiles.user_id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function clearSafetyNote(userId: string) {
  await db().update(schema.profiles).set({ safety_note: null, updated_at: new Date() }).where(eq(schema.profiles.user_id, userId));
}
