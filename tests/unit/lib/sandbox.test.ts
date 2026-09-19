/** The two-avatar sandbox, pure parts: what a scenario needs, what each avatar is given, whose turn it is, when it stops. */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { AvatarBriefSchema, PersonasSchema, RehearsalTurnSchema } from "@/lib/llm/schemas";
import { LLM_CONFIG, ROLES } from "@/config/llm";
import { configureLlm, MemoryMemo, MemoryRecorder, validateResult } from "@/lib/llm";
import { FakeAnthropic, toolUseResponse } from "@/tests/unit/helpers/fake_anthropic";
import { briefsReady, buildBriefWriterInput, buildSandboxAvatarInput, nextSide, sandboxIsOver, ScenarioSchema, type SandboxTurn, type Scenario } from "@/lib/sandbox/scenario";
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
    // maxTurns is a safety cap now, not a length.
    expect(scenario).toMatchObject({ openingLine: "", maxTurns: 40, firstSpeaker: "b" });
    const raw = { a: scenario.a, b: scenario.b, shared: scenario.shared, situation: scenario.situation, firstSpeaker: "a" };
    expect(ScenarioSchema.safeParse({ ...raw, b: { ...scenario.b, name: " mara " } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, a: { name: "Mara", notes: "too short" } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, situation: "" }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, maxTurns: 1000 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...raw, maxTurns: 8 }).success).toBe(true);
    expect(parseScenario(JSON.stringify(scenario))).toEqual(scenario);
    expect(parseScenario("not json")).toBeNull();
    expect(parseScenario("{}")).toBeNull();
  });
});

describe("what each avatar is given", () => {
  it("the brief writer sees one person's notes, the shared history and the situation, and never the other's notes", () => {
    const forJonas = buildBriefWriterInput(scenario, "b");
    expect(forJonas).toEqual({ you: "Jonas", partner: "Mara", notes: scenario.b.notes, shared_history: scenario.shared, situation: scenario.situation });
    expect(JSON.stringify(forJonas)).not.toContain("Lisbon");
    expect(JSON.stringify(buildBriefWriterInput(scenario, "a"))).not.toContain("youngest of four");
  });

  it("the avatar is given the brief written to it and what has been said since, and nothing written about it from outside", () => {
    const brief = "You are Jonas. You are the youngest of four. Right now the doorbell has just gone, and neither of you has moved.";
    const input = buildSandboxAvatarInput(scenario, "b", brief, [t("b", "Are you getting that?"), t("a", "It's your mother.")]);
    expect(input).toEqual({
      you: "Jonas",
      partner: "Mara",
      brief,
      so_far: [
        { who: "you", says: "Are you getting that?", does: null },
        { who: "Mara", says: "It's your mother.", does: null },
      ],
    });
    // No count of turns left: they end it themselves.
    expect(Object.keys(input)).not.toContain("exchanges_left");
    // The third-person notes, the shared history and the situation reach it only through its brief.
    expect(JSON.stringify(input)).not.toMatch(/Lisbon|When pressed he leaves|Neither of them has moved/);
  });

  it("nobody speaks until both briefs exist", () => {
    expect(briefsReady({ a: null, b: null })).toBe(false);
    expect(briefsReady({ a: "You are Mara.", b: "  " })).toBe(false);
    expect(briefsReady({ a: "You are Mara.", b: "You are Jonas." })).toBe(true);
  });
});

describe("fiction is outside the language guardrail, and only fiction is", () => {
  it("exactly the three sandbox roles are marked as fiction", () => {
    expect(ROLES.filter((r) => LLM_CONFIG[r].fiction).sort()).toEqual(["brief_writer", "persona_writer", "sandbox_avatar"]);
  });

  it("an invented person may call another a name; a real person's rehearsal avatar may not", async () => {
    const turn = { impact: -2, intent: -2, does: null, ends: false, draws_on: [], says: "You are selfish, Jonas. You always have been. It's a deal-breaker and you know it." };
    configureLlm({ client: new FakeAnthropic() as never, recorder: new MemoryRecorder(), memo: new MemoryMemo() });
    const ctx = { coupleId: null, jobStep: "test" };
    const asFiction = await validateResult("sandbox_avatar", toolUseResponse("emit_sandbox_turn", turn) as never, RehearsalTurnSchema, ctx);
    expect(asFiction.ok).toBe(true);
    const asReal = await validateResult("rehearsal", toolUseResponse("emit_rehearsal_turn", turn) as never, RehearsalTurnSchema, ctx);
    expect(asReal).toMatchObject({ ok: false, kind: "guardrail_failed" });
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
    expect(buildRequest("brief_writer", { any: "input" }, AvatarBriefSchema as ZodType<unknown>).tool_choice).toMatchObject({ type: "tool", name: "emit_brief_for_avatar" });
    const p = { a_name: "Mara", b_name: "Jonas", situations: ["The doorbell goes and neither of them moves."], a_notes: "x".repeat(250), b_notes: "z".repeat(250), shared_history: "y".repeat(120) };
    expect(PersonasSchema.safeParse(p).success).toBe(true);
    expect(PersonasSchema.safeParse({ ...p, a_notes: "short" }).success).toBe(false);
    expect(PersonasSchema.safeParse({ ...p, situations: [] }).success).toBe(false);
    // Short fields first, long prose last: the order the wire schema is generated in.
    expect(Object.keys(PersonasSchema.shape)).toEqual(["a_name", "b_name", "situations", "a_notes", "b_notes", "shared_history"]);
  });
});
