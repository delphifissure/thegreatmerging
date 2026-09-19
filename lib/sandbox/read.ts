/** Reads a sandbox back out of its thread: the scenario from the first turn, then the conversation. */
import * as data from "@/lib/data";
import type { Move } from "@/lib/replay/moves";
import { ScenarioSchema, type Briefs, type SandboxTurn, type Scenario, type Side } from "@/lib/sandbox/scenario";

export type Sandbox = { threadId: string; scenario: Scenario; briefs: Briefs; turns: SandboxTurn[]; maxTurns: number; created_at: Date };

export function parseScenario(text: string): Scenario | null {
  try {
    const parsed = ScenarioSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readSandbox(threadId: string, userId: string): Promise<Sandbox | null> {
  const thread = await data.getOwnThread(threadId, userId);
  if (!thread || thread.kind !== "sandbox") return null;
  const all = await data.listTurns(thread.id, userId);
  const scenario = all[0]?.meta.kind === "scenario" ? parseScenario(all[0].text) : null;
  if (!scenario) return null;
  const turns: SandboxTurn[] = all
    .filter((t) => t.meta.kind === "turn")
    .map((t) => {
      const words = JSON.parse(t.text) as { says: string | null; does: string | null };
      const m = t.meta as { side: Side; move?: Move; secondary?: Move | null; intent?: number | null; impact?: number | null; ends?: boolean; given?: boolean };
      return { side: m.side, says: words.says, does: words.does, ends: m.ends === true, move: m.move, secondary: m.secondary ?? null, intent: m.intent ?? null, impact: m.impact ?? null, given: m.given === true };
    });
  // A brief can be rewritten before the conversation starts; the newest one for each side is the one in force.
  const briefs: Briefs = { a: null, b: null };
  for (const t of all) if (t.meta.kind === "brief" && (t.meta.side === "a" || t.meta.side === "b")) briefs[t.meta.side] = t.text;
  const extra = all.filter((t) => t.meta.kind === "extend").reduce((n, t) => n + (typeof t.meta.by === "number" ? t.meta.by : 0), 0);
  return { threadId: thread.id, scenario, briefs, turns, maxTurns: scenario.maxTurns + extra, created_at: thread.created_at };
}
