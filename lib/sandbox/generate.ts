/**
 * Writing two people for the sandbox, in three calls with one long field each: first the life they
 * share, then each person separately, built on it. One call with three long fields failed about one
 * time in two: after the first long string the model derailed and filled the rest with "placeholder".
 */
import type { z } from "zod";
import type { Role } from "@/config/llm";
import { CoupleOutlineSchema, PersonaNotesSchema, type Personas } from "@/lib/llm/schemas";

export type Call = <T>(role: Role, input: unknown, schema: z.ZodType<T>, step: string) => Promise<T>;

export async function generatePersonas(input: { seed: string; names: [string, string]; call: Call }): Promise<Personas> {
  const { seed, names, call } = input;
  const couple = await call("couple_writer", { seed, names }, CoupleOutlineSchema, "couple");
  const person = (me: 0 | 1) =>
    call(
      "persona_writer",
      { seed, you: names[me], partner: names[me === 0 ? 1 : 0], your_sketch: me === 0 ? couple.a_sketch : couple.b_sketch, partner_sketch: me === 0 ? couple.b_sketch : couple.a_sketch, shared_history: couple.shared_history },
      PersonaNotesSchema,
      `person:${me === 0 ? "a" : "b"}`,
    );
  const [a, b] = await Promise.all([person(0), person(1)]);
  // Whatever the model did with them, the names are the ones that were drawn or typed.
  return { a_name: names[0], b_name: names[1], situations: couple.situations, a_notes: a.notes.trim(), b_notes: b.notes.trim(), shared_history: couple.shared_history.trim() };
}
