/**
 * Writing two people for the sandbox, in three calls with one long field each: first the life they
 * share, then each person separately, built on it. One call with three long fields failed about one
 * time in two: after the first long string the model derailed and filled the rest with "placeholder".
 *
 * The bones of each life are drawn in code first (lib/sandbox/lives.ts), because the model left to
 * itself writes the same childhood, the same fear and the same way of arguing every time.
 */
import type { z } from "zod";
import type { Role } from "@/config/llm";
import { CoupleOutlineSchema, PersonaNotesSchema, type Personas } from "@/lib/llm/schemas";
import { publicGivens, type Lives } from "@/lib/sandbox/lives";

export type Call = <T>(role: Role, input: unknown, schema: z.ZodType<T>, step: string) => Promise<T>;

export async function generatePersonas(input: { seed: string; names: [string, string]; lives: Lives; call: Call }): Promise<Personas> {
  const { seed, names, lives, call } = input;
  // The couple writer is told what a friend of the couple would know of each of them. What each is afraid of, and what each has never said, go only to that person's own writer.
  const couple = await call("couple_writer", { seed, names, givens: { ...lives.couple, a: publicGivens(lives.a), b: publicGivens(lives.b) } }, CoupleOutlineSchema, "couple");
  const person = (me: 0 | 1) =>
    call(
      "persona_writer",
      {
        seed,
        you: names[me],
        partner: names[me === 0 ? 1 : 0],
        givens: me === 0 ? lives.a : lives.b,
        form: me === 0 ? lives.forms.a : lives.forms.b,
        your_sketch: me === 0 ? couple.a_sketch : couple.b_sketch,
        partner_sketch: me === 0 ? couple.b_sketch : couple.a_sketch,
        shared_history: couple.shared_history,
      },
      PersonaNotesSchema,
      `person:${me === 0 ? "a" : "b"}`,
    );
  const [a, b] = await Promise.all([person(0), person(1)]);
  // Whatever the model did with them, the names are the ones that were drawn or typed.
  return { a_name: names[0], b_name: names[1], situations: couple.situations, a_notes: a.notes.trim(), b_notes: b.notes.trim(), shared_history: couple.shared_history.trim() };
}
