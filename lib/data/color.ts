/**
 * Color-layer sessions, answers and tags. Sessions are private to their owner; the brief job
 * reads both partners' answers for a domain on the couple's behalf, audited per user.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { MachineState } from "@/lib/color/machine";
import type { Domain } from "@/instruments/schema";
import { audit } from "./audit";
import { getConsent, getCouple } from "./users";

export type TranscriptTurn = { role: "system" | "user"; content: string; step: string; question_id?: string; at: string };

export async function getOrCreateColorSession(input: { userId: string; coupleId: string; domain: Domain; runId: string | null; initialState: () => MachineState }) {
  const existing = await db()
    .select()
    .from(schema.color_sessions)
    .where(and(eq(schema.color_sessions.user_id, input.userId), eq(schema.color_sessions.couple_id, input.coupleId), eq(schema.color_sessions.domain, input.domain)))
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await db()
    .insert(schema.color_sessions)
    .values({ user_id: input.userId, couple_id: input.coupleId, domain: input.domain, run_id: input.runId, state: input.initialState(), transcript: [] })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];
  const again = await db()
    .select()
    .from(schema.color_sessions)
    .where(and(eq(schema.color_sessions.user_id, input.userId), eq(schema.color_sessions.couple_id, input.coupleId), eq(schema.color_sessions.domain, input.domain)))
    .limit(1);
  return again[0];
}

export async function getColorSession(sessionId: string) {
  const rows = await db().select().from(schema.color_sessions).where(eq(schema.color_sessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
}

export async function saveColorSession(input: { sessionId: string; state: MachineState; appendTranscript?: TranscriptTurn[] }) {
  const current = await getColorSession(input.sessionId);
  if (!current) throw new Error("color session not found");
  const transcript = [...((current.transcript as TranscriptTurn[]) ?? []), ...(input.appendTranscript ?? [])];
  const complete = input.state.state === "complete";
  await db()
    .update(schema.color_sessions)
    .set({
      state: input.state,
      transcript,
      status: complete ? "complete" : "open",
      completed_at: complete ? (current.completed_at ?? new Date()) : null,
      updated_at: new Date(),
    })
    .where(eq(schema.color_sessions.id, input.sessionId));
}

export async function writeColorAnswer(input: {
  sessionId: string;
  userId: string;
  coupleId: string;
  step: "specifics" | "preference" | "tag" | "polarization" | "perception_gap" | "context" | "consistency" | "probe";
  questionId: string;
  questionText: string;
  itemRef?: string | null;
  answerText: string | null;
  skipped: boolean;
  shareableVerbatim?: boolean;
}) {
  const rows = await db()
    .insert(schema.color_answers)
    .values({
      session_id: input.sessionId,
      user_id: input.userId,
      couple_id: input.coupleId,
      step: input.step,
      question_id: input.questionId,
      question_text: input.questionText,
      item_ref: input.itemRef ?? null,
      answer_text: input.answerText,
      skipped: input.skipped,
      shareable_verbatim: input.shareableVerbatim ?? false,
    })
    .returning();
  return rows[0];
}

export async function setAnswerShareable(input: { answerId: string; userId: string; shareable: boolean }) {
  await db()
    .update(schema.color_answers)
    .set({ shareable_verbatim: input.shareable, updated_at: new Date() })
    .where(and(eq(schema.color_answers.id, input.answerId), eq(schema.color_answers.user_id, input.userId)));
}

export async function writeTag(input: { userId: string; coupleId: string; domain: Domain; itemRef: string; tag: "requirement" | "preference"; comment: string }) {
  const comment = input.comment.trim();
  if (!comment) throw new Error("a tag requires a non-empty comment");
  const rows = await db()
    .insert(schema.tags)
    .values({ user_id: input.userId, couple_id: input.coupleId, domain: input.domain, item_ref: input.itemRef, tag: input.tag, comment })
    .onConflictDoUpdate({
      target: [schema.tags.user_id, schema.tags.couple_id, schema.tags.item_ref],
      set: { tag: input.tag, comment, domain: input.domain, updated_at: new Date(), deleted_at: null },
    })
    .returning();
  return rows[0];
}

export async function listOwnColorAnswers(userId: string, coupleId: string, domain?: Domain) {
  const rows = await db()
    .select({ a: schema.color_answers, domain: schema.color_sessions.domain })
    .from(schema.color_answers)
    .innerJoin(schema.color_sessions, eq(schema.color_sessions.id, schema.color_answers.session_id))
    .where(and(eq(schema.color_answers.user_id, userId), eq(schema.color_answers.couple_id, coupleId), isNull(schema.color_answers.deleted_at), ...(domain ? [eq(schema.color_sessions.domain, domain)] : [])));
  return rows.map((r) => ({ ...r.a, domain: r.domain as Domain }));
}

export async function listOwnTags(userId: string, coupleId: string, domain?: Domain) {
  return db()
    .select()
    .from(schema.tags)
    .where(and(eq(schema.tags.user_id, userId), eq(schema.tags.couple_id, coupleId), isNull(schema.tags.deleted_at), ...(domain ? [eq(schema.tags.domain, domain)] : [])));
}

export async function listOwnSessions(userId: string, coupleId: string) {
  return db()
    .select()
    .from(schema.color_sessions)
    .where(and(eq(schema.color_sessions.user_id, userId), eq(schema.color_sessions.couple_id, coupleId)));
}

/** Completion status per domain for both partners (status only; no content). */
export async function coupleColorStatus(coupleId: string, domains: Domain[]) {
  const couple = await getCouple(coupleId);
  if (!couple || !couple.partner_b_id) return { both_complete: false, by_user: {} as Record<string, Record<string, "open" | "complete" | "not_started">> };
  const rows = await db()
    .select({ user_id: schema.color_sessions.user_id, domain: schema.color_sessions.domain, status: schema.color_sessions.status })
    .from(schema.color_sessions)
    .where(eq(schema.color_sessions.couple_id, coupleId));
  const by_user: Record<string, Record<string, "open" | "complete" | "not_started">> = {};
  for (const id of [couple.partner_a_id, couple.partner_b_id]) {
    by_user[id] = {};
    for (const d of domains) by_user[id][d] = "not_started";
  }
  for (const r of rows) if (by_user[r.user_id]) by_user[r.user_id][r.domain] = r.status;
  const both_complete = domains.every((d) => by_user[couple.partner_a_id][d] === "complete" && by_user[couple.partner_b_id!][d] === "complete");
  return { both_complete, by_user };
}

/**
 * Both partners' answers and tags for one domain, for the brief job. Cross-user read on the
 * couple's behalf: audited per partner with that partner's consent state.
 */
export async function listDomainMaterialForBrief(coupleId: string, domain: Domain, jobName: string) {
  const couple = await getCouple(coupleId);
  if (!couple || !couple.partner_b_id) throw new Error("couple incomplete");
  const out: Record<
    string,
    {
      consent: Awaited<ReturnType<typeof getConsent>>;
      answers: Array<typeof schema.color_answers.$inferSelect>;
      tags: Array<typeof schema.tags.$inferSelect>;
    }
  > = {};
  for (const userId of [couple.partner_a_id, couple.partner_b_id]) {
    const consent = await getConsent(userId, coupleId);
    await audit({
      actorUserId: null,
      actorKind: "job",
      action: `${jobName}.read_color_answers`,
      targetUserId: userId,
      targetTable: "color_answers",
      targetId: `${coupleId}:${domain}`,
      consentState: consent,
    });
    const answers = await listOwnColorAnswers(userId, coupleId, domain);
    const tags = await listOwnTags(userId, coupleId, domain);
    out[userId] = { consent, answers, tags };
  }
  return { couple, byUser: out };
}
