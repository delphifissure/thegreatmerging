/**
 * The sandbox: two made-up people, written or generated, each with a life history of the kind a
 * therapist would hold in their notes, plus the history they share. Each avatar is given its own
 * notes and the shared history, never the other's notes, and then a situation. Nothing here is
 * about a real person, so nothing is blinded: whoever set it up reads both sides.
 */
import { z } from "zod";
import type { Move } from "@/lib/replay/moves";

const Text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const PersonaSchema = z.object({ name: Text(1, 40), notes: Text(40, 6000) });
export const ScenarioSchema = z
  .object({
    a: PersonaSchema,
    b: PersonaSchema,
    /** How their histories overlap: how they met, how long, what keeps coming up between them. Both avatars are given this. */
    shared: Text(20, 4000),
    situation: Text(10, 1500),
    firstSpeaker: z.enum(["a", "b"]),
    /** Optional. When given, the conversation starts from this line and nothing is generated for it. */
    openingLine: z.string().trim().max(300).default(""),
    maxTurns: z.number().int().min(4).max(24).default(12),
  })
  .refine((s) => s.a.name.toLowerCase() !== s.b.name.toLowerCase(), { message: "The two people need different names.", path: ["b", "name"] });
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Side = "a" | "b";

export type SandboxTurn = { side: Side; says: string | null; does: string | null; ends: boolean; move?: Move; secondary?: Move | null; intent?: number | null; impact?: number | null; given?: boolean };

export const other = (side: Side): Side => (side === "a" ? "b" : "a");

/** What one avatar is given. Its own notes and the shared history; never the other person's notes. */
export function buildSandboxAvatarInput(scenario: Scenario, side: Side, turns: SandboxTurn[], maxTurns: number) {
  const me = scenario[side];
  const them = scenario[other(side)];
  return {
    you: me.name,
    partner: them.name,
    your_notes: me.notes,
    shared_history: scenario.shared,
    situation: scenario.situation,
    so_far: turns.map((t) => ({ who: t.side === side ? "you" : them.name, says: t.says, does: t.does })),
    exchanges_left: Math.max(0, maxTurns - turns.length),
  };
}

/** The same thing in words, for the person running the sandbox to read: what this avatar was told about itself. */
export function briefFor(scenario: Scenario, side: Side): string {
  const me = scenario[side];
  return [`You are ${me.name}. ${scenario[other(side)].name} is the person you share your life with.`, `Your history, and how you are:\n${me.notes}`, `The two of you:\n${scenario.shared}`, `What is happening now:\n${scenario.situation}`].join("\n\n");
}

export const nextSide = (scenario: Scenario, turns: SandboxTurn[]): Side => (turns.length === 0 ? scenario.firstSpeaker : other(turns[turns.length - 1].side));

export function sandboxIsOver(turns: SandboxTurn[], maxTurns: number): boolean {
  if (turns.length === 0) return false;
  if (turns[turns.length - 1].ends || turns.length >= maxTurns) return true;
  const tail = turns.slice(-2);
  return tail.length === 2 && tail.every((t) => !t.says?.trim());
}

export const SANDBOX_EXTEND_BY = 6;
export const SANDBOX_HARD_LIMIT = 48;
