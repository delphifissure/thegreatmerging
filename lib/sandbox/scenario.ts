/**
 * The sandbox: two made-up people, written or generated, each with a life history of the kind a
 * therapist would hold in their notes, plus the history they share. Those notes are written about
 * the two of them; each avatar is given a brief written TO it, in the second person, made from its
 * own notes, the shared history and the situation, and never from the other's notes. Nothing here
 * is about a real person, so nothing is blinded and nothing is filtered: whoever set it up reads
 * both sides, and the two can say whatever they would say.
 */
import { z } from "zod";
import type { Move } from "@/lib/replay/moves";

const Text = (min: number, max: number) => z.string().trim().min(min).max(max);
const SANDBOX_DEFAULT_CAP = 40;
const SANDBOX_HARD_LIMIT_VALUE = 100;

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
    /** A safety cap, not a length: the two of them decide when it is over. Older sandboxes stored a short fixed number here. */
    maxTurns: z.number().int().min(4).max(SANDBOX_HARD_LIMIT_VALUE).default(SANDBOX_DEFAULT_CAP),
  })
  .refine((s) => s.a.name.toLowerCase() !== s.b.name.toLowerCase(), { message: "The two people need different names.", path: ["b", "name"] });
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Side = "a" | "b";

export type SandboxTurn = { side: Side; says: string | null; does: string | null; ends: boolean; move?: Move; secondary?: Move | null; intent?: number | null; impact?: number | null; given?: boolean };

export const other = (side: Side): Side => (side === "a" ? "b" : "a");

/** What the brief writer is given for one person: their own notes, the shared history and the situation. Never the other person's notes. */
export function buildBriefWriterInput(scenario: Scenario, side: Side) {
  return { you: scenario[side].name, partner: scenario[other(side)].name, notes: scenario[side].notes, shared_history: scenario.shared, situation: scenario.situation };
}

/** What one avatar is given: the brief written to it, and what has been said since. */
export function buildSandboxAvatarInput(scenario: Scenario, side: Side, brief: string, turns: SandboxTurn[]) {
  const them = scenario[other(side)];
  // No count of turns left: they end it themselves, and a number makes them wrap up to fit it.
  return { you: scenario[side].name, partner: them.name, brief, so_far: turns.map((t) => ({ who: t.side === side ? "you" : them.name, says: t.says, does: t.does })) };
}

export type Briefs = Record<Side, string | null>;
export const briefsReady = (b: Briefs): b is Record<Side, string> => !!b.a?.trim() && !!b.b?.trim();

export const nextSide = (scenario: Scenario, turns: SandboxTurn[]): Side => (turns.length === 0 ? scenario.firstSpeaker : other(turns[turns.length - 1].side));

export function sandboxIsOver(turns: SandboxTurn[], maxTurns: number): boolean {
  if (turns.length === 0) return false;
  if (turns[turns.length - 1].ends || turns.length >= maxTurns) return true;
  const tail = turns.slice(-2);
  return tail.length === 2 && tail.every((t) => !t.says?.trim());
}

export const SANDBOX_EXTEND_BY = 20;
export const SANDBOX_HARD_LIMIT = SANDBOX_HARD_LIMIT_VALUE;
