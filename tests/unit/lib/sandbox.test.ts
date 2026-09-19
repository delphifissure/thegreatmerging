/** The two-avatar sandbox, pure parts: what a scenario needs, what each avatar is given, whose turn it is, when it stops. */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { AvatarBriefSchema, CoupleOutlineSchema, PersonaNotesSchema, RehearsalTurnSchema, SandboxTurnSchema } from "@/lib/llm/schemas";
import { generatePersonas } from "@/lib/sandbox/generate";
import { LLM_CONFIG, ROLES } from "@/config/llm";
import { configureLlm, MemoryMemo, MemoryRecorder, validateResult } from "@/lib/llm";
import { FakeAnthropic, toolUseResponse } from "@/tests/unit/helpers/fake_anthropic";
import { briefsReady, buildBriefWriterInput, buildSandboxAvatarInput, nextSide, sandboxIsOver, ScenarioSchema, type SandboxTurn, type Scenario } from "@/lib/sandbox/scenario";
import { parseScenario } from "@/lib/sandbox/read";
import { NAME_POOL, pickNames, surpriseSeed, type Draw } from "@/lib/sandbox/names";
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
    expect(forJonas).toEqual({ you: "Jonas", partner: "Mara", notes: scenario.b.notes, shared_history: scenario.shared, situation: scenario.situation, only_you_know: "" });
    expect(JSON.stringify(forJonas)).not.toContain("Lisbon");
    expect(JSON.stringify(buildBriefWriterInput(scenario, "a"))).not.toContain("youngest of four");
  });

  it("each person's private side of right now reaches their own brief writer and never the other's", () => {
    const withSides = ScenarioSchema.parse({ ...scenario, aOnly: "She thinks the calls are from Carla, a woman he used to work with.", bOnly: "His father has been leaving voicemails about his memory, and he has deleted three." });
    const forMara = buildBriefWriterInput(withSides, "a");
    const forJonas = buildBriefWriterInput(withSides, "b");
    expect(forMara.only_you_know).toContain("Carla");
    expect(JSON.stringify(forMara)).not.toMatch(/voicemails|father/);
    expect(forJonas.only_you_know).toContain("voicemails");
    expect(JSON.stringify(forJonas)).not.toContain("Carla");
    // Older sandboxes have no private sides.
    expect(scenario).toMatchObject({ aOnly: "", bOnly: "" });
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
    expect(ROLES.filter((r) => LLM_CONFIG[r].fiction).sort()).toEqual(["brief_writer", "couple_writer", "persona_writer", "sandbox_avatar"]);
  });

  it("an invented person may call another a name; a real person's rehearsal avatar may not", async () => {
    const says = "You are selfish, Jonas. You always have been. It's a deal-breaker and you know it.";
    const turn = { felt: "Furious.", wants: "To make him flinch.", impact: -2, intent: -2, does: null, ends: false, says };
    configureLlm({ client: new FakeAnthropic() as never, recorder: new MemoryRecorder(), memo: new MemoryMemo() });
    const ctx = { coupleId: null, jobStep: "test" };
    const asFiction = await validateResult("sandbox_avatar", toolUseResponse("emit_sandbox_turn", turn) as never, SandboxTurnSchema, ctx);
    // What it feels and wants comes before what it says, so the speech follows from the appraisal.
    expect(Object.keys(SandboxTurnSchema.shape).slice(0, 2)).toEqual(["felt", "wants"]);
    expect(Object.keys(SandboxTurnSchema.shape).at(-1)).toBe("says");
    expect(asFiction.ok).toBe(true);
    const asReal = await validateResult("rehearsal", toolUseResponse("emit_rehearsal_turn", { impact: -2, intent: -2, does: null, ends: false, draws_on: [], says }) as never, RehearsalTurnSchema, ctx);
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
  it("every sandbox role is a forced-tool request, and the avatar speaks in the same shape as a rehearsal turn", () => {
    for (const [role, schema, tool] of [
      ["couple_writer", CoupleOutlineSchema, "emit_couple"],
      ["persona_writer", PersonaNotesSchema, "emit_persona"],
      ["brief_writer", AvatarBriefSchema, "emit_brief_for_avatar"],
      ["sandbox_avatar", SandboxTurnSchema, "emit_sandbox_turn"],
    ] as const) {
      expect(buildRequest(role, { any: "input" }, schema as ZodType<unknown>).tool_choice).toMatchObject({ type: "tool", name: tool });
    }
  });

  it("each writer's output has one long field, and it comes last", () => {
    expect(Object.keys(CoupleOutlineSchema.shape)).toEqual(["a_sketch", "b_sketch", "situations", "shared_history"]);
    expect(Object.keys(PersonaNotesSchema.shape)).toEqual(["notes"]);
    expect(PersonaNotesSchema.safeParse({ notes: "placeholder" }).success).toBe(false);
  });

  it("the couple is written first, then each person on top of it, each seeing only the other's sketch; the names are the ones given", async () => {
    const seen: Array<{ role: string; input: Record<string, unknown> }> = [];
    const personas = await generatePersonas({
      seed: "together nine years",
      names: ["Leila", "Hugo"],
      call: async (role, input) => {
        seen.push({ role, input: input as Record<string, unknown> });
        return (role === "couple_writer" ? { a_sketch: "Leila is a nurse.", b_sketch: "Hugo works from home.", situations: ["The box is in the recycling."], shared_history: "They met nine years ago." } : { notes: ` Notes about ${(input as { you: string }).you}. ` }) as never;
      },
    });
    expect(seen.map((s) => s.role)).toEqual(["couple_writer", "persona_writer", "persona_writer"]);
    expect(seen[1].input).toMatchObject({ you: "Leila", partner: "Hugo", your_sketch: "Leila is a nurse.", partner_sketch: "Hugo works from home.", shared_history: "They met nine years ago." });
    expect(seen[2].input).toMatchObject({ you: "Hugo", partner: "Leila", your_sketch: "Hugo works from home." });
    expect(personas).toEqual({ a_name: "Leila", b_name: "Hugo", situations: ["The box is in the recycling."], a_notes: "Notes about Leila.", b_notes: "Notes about Hugo.", shared_history: "They met nine years ago." });
  });
});

describe("names and surprises are drawn in code, not by the model", () => {
  const first: Draw = () => 0;
  const counting = (): Draw => {
    let n = 0;
    return (max) => n++ % max;
  };

  it("draws two different names, keeps what was typed, and skips names from earlier sandboxes", () => {
    const [a, b] = pickNames({ typed: [undefined, undefined], used: [], draw: first });
    expect(a).toBe(NAME_POOL[0]);
    expect(b).toBe(NAME_POOL[1]);
    expect(pickNames({ typed: [" Renata ", undefined], used: [], draw: first })).toEqual(["Renata", NAME_POOL[0]]);
    expect(pickNames({ typed: [undefined, NAME_POOL[0]], used: [], draw: first })).toEqual([NAME_POOL[1], NAME_POOL[0]]);
    const [c, d] = pickNames({ typed: [undefined, undefined], used: [NAME_POOL[0].toUpperCase(), NAME_POOL[1]], draw: first });
    expect([c, d]).toEqual([NAME_POOL[2], NAME_POOL[3]]);
  });

  it("still gives two different names when every name has been used before", () => {
    const [a, b] = pickNames({ typed: [undefined, undefined], used: [...NAME_POOL], draw: counting() });
    expect(a).not.toBe(b);
    expect(NAME_POOL).toContain(a);
  });

  it("the pool is large, has no repeats, and leaves out the names the model kept choosing", () => {
    expect(NAME_POOL.length).toBeGreaterThan(100);
    expect(new Set(NAME_POOL.map((n) => n.toLowerCase())).size).toBe(NAME_POOL.length);
    for (const favourite of ["Renata", "Dov", "Marcus", "Elena", "Maya"]) expect(NAME_POOL).not.toContain(favourite);
  });

  it("a surprise is a drawn outline of a couple with two different jobs", () => {
    const seed = surpriseSeed(counting());
    expect(seed).toMatch(/^Together .+\. One of them .+, the other .+\. They live in .+\. What keeps coming back between them is .+\.$/);
    const [, one, two] = /One of them (.+), the other (.+?)\. They live/.exec(seed)!;
    expect(one).not.toBe(two);
    expect(surpriseSeed(first)).not.toBe(surpriseSeed(counting()));
  });
});
