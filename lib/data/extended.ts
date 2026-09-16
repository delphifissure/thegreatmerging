/**
 * Extended modules (section 11): third-caregiver answers and the child conversation.
 * Child answers are typed by an adult and stored under the child_proxy role concept
 * (recorded_by is the adult); the two rule questions are pinned to the plan.
 */
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { audit } from "./audit";

export async function writeCaregiverAnswer(input: { coupleId: string; userId: string; questionId: string; answerText: string | null }) {
  await db()
    .insert(schema.caregiver_answers)
    .values({ couple_id: input.coupleId, user_id: input.userId, question_id: input.questionId, answer_text: input.answerText })
    .onConflictDoUpdate({
      target: [schema.caregiver_answers.couple_id, schema.caregiver_answers.user_id, schema.caregiver_answers.question_id],
      set: { answer_text: input.answerText, updated_at: new Date() },
    });
}

export async function listCaregiverAnswers(coupleId: string, userId: string) {
  return db()
    .select()
    .from(schema.caregiver_answers)
    .where(and(eq(schema.caregiver_answers.couple_id, coupleId), eq(schema.caregiver_answers.user_id, userId), isNull(schema.caregiver_answers.deleted_at)));
}

export async function writeChildConversationAnswer(input: { coupleId: string; recordedBy: string; questionId: string; answerText: string | null; pinToPlan: boolean }) {
  const rows = await db()
    .insert(schema.child_conversation_answers)
    .values({ couple_id: input.coupleId, recorded_by: input.recordedBy, question_id: input.questionId, answer_text: input.answerText, pinned_to_plan: input.pinToPlan })
    .returning();
  await audit({ actorUserId: input.recordedBy, action: "child_conversation.answer", targetTable: "child_conversation_answers", targetId: rows[0].id, metadata: { question_id: input.questionId, pinned: input.pinToPlan } });
  return rows[0];
}

export async function listChildConversationAnswers(coupleId: string) {
  return db()
    .select()
    .from(schema.child_conversation_answers)
    .where(and(eq(schema.child_conversation_answers.couple_id, coupleId), isNull(schema.child_conversation_answers.deleted_at)))
    .orderBy(asc(schema.child_conversation_answers.created_at));
}

export async function listCoupleMembers(coupleId: string) {
  return db()
    .select({ user_id: schema.couple_members.user_id, role: schema.couple_members.role, display_name: schema.users.display_name })
    .from(schema.couple_members)
    .innerJoin(schema.users, eq(schema.users.id, schema.couple_members.user_id))
    .where(and(eq(schema.couple_members.couple_id, coupleId), isNull(schema.couple_members.deleted_at)));
}

export async function listExports(input: { coupleId: string | null; userId: string }) {
  const ownerClause = input.coupleId ? or(eq(schema.exports.couple_id, input.coupleId), eq(schema.exports.user_id, input.userId)) : eq(schema.exports.user_id, input.userId);
  return db()
    .select()
    .from(schema.exports)
    .where(and(isNull(schema.exports.deleted_at), ownerClause))
    .orderBy(desc(schema.exports.created_at));
}
