/** Square One mode: a private single-user notebook. No scoring, no LLM, no sharing. */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export async function getSquareOne(userId: string) {
  const notes = await db().select().from(schema.square_one_notes).where(eq(schema.square_one_notes.user_id, userId));
  const req = await db().select().from(schema.square_one_requirements).where(eq(schema.square_one_requirements.user_id, userId)).limit(1);
  return { notes, requirements: (req[0]?.items as string[] | undefined) ?? [] };
}

export async function saveSquareOneRequirements(userId: string, items: string[]) {
  await db()
    .insert(schema.square_one_requirements)
    .values({ user_id: userId, items })
    .onConflictDoUpdate({ target: schema.square_one_requirements.user_id, set: { items, updated_at: new Date() } });
}

export async function saveSquareOneNote(input: { userId: string; questionIndex: number; notes: string | null; raisedEyebrow: boolean }) {
  await db()
    .insert(schema.square_one_notes)
    .values({ user_id: input.userId, question_index: input.questionIndex, notes: input.notes, raised_eyebrow: input.raisedEyebrow })
    .onConflictDoUpdate({
      target: [schema.square_one_notes.user_id, schema.square_one_notes.question_index],
      set: { notes: input.notes, raised_eyebrow: input.raisedEyebrow, updated_at: new Date() },
    });
  void and;
}
