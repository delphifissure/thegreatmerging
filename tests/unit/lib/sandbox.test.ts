/** The two-avatar sandbox, pure parts: what a scenario needs, what each avatar is given, whose turn it is, when it stops. */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { PersonasSchema, RehearsalTurnSchema } from "@/lib/llm/schemas";
import { briefFor, buildSandboxAvatarInput, nextSide, sandboxIsOver, ScenarioSchema, type SandboxTurn, type Scenario } from "@/lib/sandbox/scenario";
import { parseScenario } from "@/lib/sandbox/read";
import { buildRequest } from "@/lib/llm";

const scenario: Scenario = ScenarioSchema.parse({
  a: { name: "Mara", notes: "Grew up above her parents' shop. Has never told Jonas that she applied for a job in Lisbon last spring." },
  b: { name: "Jonas", notes: "The youngest of four. When pressed he leaves the room and comes back an hour later as if nothing happened." },
  shared: "Together eleven years, in a flat that is too small. The argument that keeps coming back is about his mother's Sunday visits.",
  situation: "Sunday, ten to four. The doorbell has just gone and neither of them has moved.",
  firstSpeaker: "b",
});
const t = (side: "a" | "b", says: string | null, ends = false): SandboxTurn => ({ side, says, does: says ? null : "says nothing", ends });

describe("a scenario", () => {
  it("needs two differently named people with notes, a shared history and a situation, and fills in the rest", () => {
    expect(scenario).toMatchObject({ openingLine: "", maxTurns: 12, firstSpeaker: "b" });
    const raw = { a: scenario.a, b: scenario.b, shared: scenario.shared, situation: scenario.situation, firstSpeaker: "a" };
    expect(ScenarioSchema.safeParse({ ...raw, b: { ...scenario.b, name: " mara " } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, a: { name: "Mara", notes: "too short" } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, situation: "" }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, maxTurns: 100 }).success).toBe(false);
    expect(parseScenario(JSON.stringify(scenario))).toEqual(scenario);
    expect(parseScenario("not json")).toBeNull();
    expect(parseScenario("{}")).toBeNull();
  });
});

describe("what each avatar is given", () => {
  it("its own notes and the shared history, and never the other person's notes", () => {
    const forJonas = buildSandboxAvatarInput(scenario, "b", [t("b", "Are you getting that?"), t("a", "It's your mother.")], 12);
    expect(forJonas).toMatchObject({ you: "Jonas", partner: "Mara", shared_history: scenario.shared, situation: scenario.situation, exchanges_left: 10 });
    expect(forJonas.your_notes).toContain("youngest of four");
    expect(JSON.stringify(forJonas)).not.toContain("Lisbon");
    expect(forJonas.so_far).toEqual([
      { who: "you", says: "Are you getting that?", does: null },
      { who: "Mara", says: "It's your mother.", does: null },
    ]);
    expect(JSON.stringify(buildSandboxAvatarInput(scenario, "a", [], 12))).not.toContain("youngest of four");
  });

  it("can be read in words by whoever set the sandbox up, one brief per avatar", () => {
    expect(briefFor(scenario, "a")).toContain("You are Mara.");
    expect(briefFor(scenario, "a")).toContain("Lisbon");
    expect(briefFor(scenario, "b")).not.toContain("Lisbon");
    expect(briefFor(scenario, "b")).toContain("Sunday, ten to four");
  });
});

describe("running order and stopping", () => {
  it("starts with the chosen speaker and alternates", () => {
    expect(nextSide(scenario, [])).toBe("b");
    expect(nextSide(scenario, [t("b", "x")])).toBe("a");
    expect(nextSide(scenario, [t("b", "x"), t("a", "y")])).toBe("b");
  });

  it("stops when someone ends it, when the turns run out, or after two silent turns, and carries on when more turns are given", () => {
    expect(sandboxIsOver([], 12)).toBe(false);
    expect(sandboxIsOver([t("b", "x"), t("a", "fine.", true)], 12)).toBe(true);
    expect(sandboxIsOver([t("b", "x"), t("a", null), t("b", null)], 12)).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => t(i % 2 ? "a" : "b", "x"));
    expect(sandboxIsOver(six, 6)).toBe(true);
    expect(sandboxIsOver(six, 12)).toBe(false);
  });
});

describe("requests", () => {
  it("both sandbox roles are forced-tool requests, and the avatar speaks in the same shape as a rehearsal turn", () => {
    expect(buildRequest("persona_writer", { seed: "", names: null }, PersonasSchema as ZodType<unknown>).tool_choice).toMatchObject({ type: "tool", name: "emit_personas" });
    expect(buildRequest("sandbox_avatar", { any: "input" }, RehearsalTurnSchema as ZodType<unknown>).tool_choice).toMatchObject({ type: "tool", name: "emit_sandbox_turn" });
    const p = { a_name: "Mara", b_name: "Jonas", situations: ["The doorbell goes and neither of them moves."], a_notes: "x".repeat(250), b_notes: "z".repeat(250), shared_history: "y".repeat(120) };
    expect(PersonasSchema.safeParse(p).success).toBe(true);
    expect(PersonasSchema.safeParse({ ...p, a_notes: "short" }).success).toBe(false);
    expect(PersonasSchema.safeParse({ ...p, situations: [] }).success).toBe(false);
    // Short fields first, long prose last: the order the wire schema is generated in.
    expect(Object.keys(PersonasSchema.shape)).toEqual(["a_name", "b_name", "situations", "a_notes", "b_notes", "shared_history"]);
  });
});
