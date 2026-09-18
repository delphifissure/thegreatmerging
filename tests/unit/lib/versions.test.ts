/**
 * The solo panel, pure parts: which versions can be built for a person, what each one is shown,
 * what the reader is shown, and the rules the reader's output has to pass.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { PanelReadingSchema, VersionReplySchema } from "@/lib/llm/schemas";
import { buildPanelReaderInput, buildVersionInput, PANEL_VERSIONS, panelReadingSchemaFor, panelVersionsFor, versionByKey } from "@/lib/biographer/versions";
import { buildRequest } from "@/lib/llm";
import type { DocumentEntry, Turn } from "@/lib/data/biographer";

const entry = (id: string, document: DocumentEntry["document"], section: string, text: string, mark: DocumentEntry["mark"] = "open", status: DocumentEntry["status"] = "ratified"): DocumentEntry => ({
  id,
  document,
  section,
  text,
  status,
  mark,
  tier: "private",
  in_their_words: true,
  source_thread_id: null,
  source_turns: [],
  ratified_at: null,
  created_at: new Date(0),
});
const turn = (seq: number, role: Turn["role"], text: string, more: Partial<Turn> = {}): Turn => ({ id: `id-${seq}`, seq, role, text, note: null, extras: null, meta: {}, rating: null, created_at: new Date(0), ...more });

const base = [
  entry("db-1", "constitution", "values", "Security comes first."),
  entry("db-2", "constitution", "requirements", "We never hide anything about money from each other.", "settled"),
  entry("db-3", "constitution", "conflict", "I explain myself at length before I ask anything."),
  entry("db-4", "constitution", "working_on", "Asking one question before I defend myself."),
  entry("db-5", "history", "family", "We lost the house when I was twelve."),
];

describe("panel version definitions", () => {
  it("every version names one kind of change, tells the person what it is, and has exactly one noise replicate", () => {
    const keys = PANEL_VERSIONS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const v of PANEL_VERSIONS) {
      expect(["none", "state", "move", "room", "open_line", "direction"]).toContain(v.kind);
      expect(v.label.startsWith("You")).toBe(true);
      expect(v.change.length).toBeGreaterThan(20);
      expect(v.instruction.length).toBeGreaterThan(20);
    }
    const replicates = PANEL_VERSIONS.filter((v) => v.replicate_of);
    expect(replicates).toHaveLength(1);
    const original = versionByKey(replicates[0].replicate_of)!;
    expect(original.instruction).toBe(replicates[0].instruction);
    expect(versionByKey("nope")).toBeNull();
  });
});

describe("panelVersionsFor", () => {
  it("builds the versions the person's lines can support, in display order", () => {
    expect(panelVersionsFor(base).map((v) => v.key)).toEqual(["as_you_are", "as_you_are_again", "rested", "depleted", "asks_first", "one_notch_ahead"]);
  });

  it("adds the room only when their lines mention work, and the turned-down fear only when a fear is marked open", () => {
    const withWork = [...base, entry("db-6", "history", "now", "At work I ask three questions before I disagree with a colleague.")];
    expect(panelVersionsFor(withWork).map((v) => v.key)).toContain("at_work");

    const openFear = [...base, entry("db-7", "constitution", "fears", "That we end up like my parents, counting every coin.")];
    const v = panelVersionsFor(openFear).find((x) => x.key === "quieter_fear")!;
    expect(v.alteredEntryId).toBe("db-7");
    expect(v.changeText).toContain("counting every coin");
    expect(v.changeText).not.toContain("{line}");
  });

  it("never varies a settled line, a draft, or a line from someone's history", () => {
    const settledFear = [...base, entry("db-7", "constitution", "fears", "Being left.", "settled")];
    expect(panelVersionsFor(settledFear).map((v) => v.key)).not.toContain("quieter_fear");
    const draftFear = [...base, entry("db-7", "constitution", "fears", "Being left.", "open", "proposed")];
    expect(panelVersionsFor(draftFear).map((v) => v.key)).not.toContain("quieter_fear");
    const historyFear = [...base, entry("db-7", "history", "fears", "Being left.")];
    expect(panelVersionsFor(historyFear).map((v) => v.key)).not.toContain("quieter_fear");
    // Two settled fears and one open one: the open one is the one that varies.
    const mixed = [...base, entry("db-7", "constitution", "fears", "Being left.", "settled"), entry("db-8", "constitution", "fears", "Looking foolish about money.")];
    expect(panelVersionsFor(mixed).find((v) => v.key === "quieter_fear")?.alteredEntryId).toBe("db-8");
  });
});

describe("buildVersionInput", () => {
  it("shows a version ratified lines with short ids, the situation and its one change, and no database id", () => {
    const entries = [...base, entry("db-7", "constitution", "fears", "Looking foolish about money."), entry("db-9", "constitution", "values", "only a draft", "open", "proposed")];
    const version = panelVersionsFor(entries).find((v) => v.key === "quieter_fear")!;
    const built = buildVersionInput({ personName: "Ben", entries, situation: "Ana wants to talk about the card bill tonight.", version, replicate: 3 });
    expect(built.input.version).toEqual({ key: "quieter_fear", kind: "open_line", instruction: version.instruction, altered_line_id: "e6" });
    expect(built.input.constitution.find((l) => l.id === "e6")?.text).toBe("Looking foolish about money.");
    expect(built.input.constitution.find((l) => l.id === "e2")?.mark).toBe("settled");
    expect(built.input.history).toEqual([{ id: "e5", section: "family", text: "We lost the house when I was twelve.", mark: "open" }]);
    expect(built.input.replicate).toBe(3);
    expect(built.entryIdOf("e6")).toBe("db-7");
    expect(built.entryIdOf("e99")).toBeNull();
    expect(JSON.stringify(built.input)).not.toMatch(/db-|only a draft/);
  });

  it("two runs of the same version differ in input, so the second is never a memoized copy of the first", () => {
    const [a, b] = panelVersionsFor(base);
    const one = buildVersionInput({ personName: "Ben", entries: base, situation: "s", version: a, replicate: 1 }).input;
    const two = buildVersionInput({ personName: "Ben", entries: base, situation: "s", version: b, replicate: 2 }).input;
    expect(one.version.instruction).toBe(two.version.instruction);
    expect(JSON.stringify(one)).not.toBe(JSON.stringify(two));
  });
});

describe("the reader", () => {
  const turns = [
    turn(1, "person", "Ana wants to talk about the card bill tonight."),
    turn(2, "avatar", "I'd wait until after dinner.", { meta: { version: "as_you_are" }, extras: { options: [], threads: [], opening_line: "Can we look at the bill together?", change: "Nothing is changed." }, rating: "like_me" }),
    turn(3, "avatar", "I'd wait until after we've eaten.", { meta: { version: "as_you_are_again" } }),
    turn(4, "avatar", "I'd start explaining the bike before she asked.", { meta: { version: "depleted", unsure: false }, rating: "bad_day" }),
    turn(5, "avatar", "This version did not come through.", { meta: { version: "rested", fallback: true } }),
    turn(6, "avatar", "From some other feature.", { meta: { version: "made_up" } }),
    turn(7, "guide", "An earlier reading.", { meta: { kind: "panel_reading" } }),
  ];

  it("sees each version's answer, its change and the person's verdict in plain words, and skips what did not come through", () => {
    const input = buildPanelReaderInput({ personName: "Ben", situation: turns[0].text, turns });
    expect(input.versions.map((v) => v.key)).toEqual(["as_you_are", "as_you_are_again", "depleted"]);
    expect(input.versions[0]).toMatchObject({ label: "You, as you are", kind: "none", change: "Nothing is changed.", opening_line: "Can we look at the bill together?", rating: "me", replicate_of: null });
    expect(input.versions[1]).toMatchObject({ replicate_of: "as_you_are", rating: null });
    expect(input.versions[2]).toMatchObject({ rating: "me_on_a_bad_day", unsure: false });
    expect(JSON.stringify(input)).not.toContain("id-");
  });

  it("may only point at versions on the panel, and never reports the noise pair as a difference", () => {
    const schema = panelReadingSchemaFor(["as_you_are", "as_you_are_again", "depleted"]);
    const ok = { same: ["Every version waits until after dinner."], differs: [{ observation: "The version short on sleep explains before it asks.", versions: ["depleted"] }], question: "What would make the evening one where you have slept?" };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, differs: [] }).success).toBe(true);
    const unknown = schema.safeParse({ ...ok, differs: [{ observation: "x", versions: ["rested"] }] });
    expect(unknown.success).toBe(false);
    expect(JSON.stringify(unknown.error?.issues)).toMatch(/Use only/);
    expect(schema.safeParse({ ...ok, differs: [{ observation: "The second run waits longer.", versions: ["as_you_are", "as_you_are_again"] }] }).success).toBe(false);
    // The pair may appear alongside a third version: that is a difference from both runs of the plain you.
    expect(schema.safeParse({ ...ok, differs: [{ observation: "Only the version short on sleep starts before dinner.", versions: ["as_you_are", "as_you_are_again", "depleted"] }] }).success).toBe(true);
  });
});

describe("schemas and requests", () => {
  it("an unsure version must hand a question to the biographer, and leaked markup is rejected", () => {
    const fine = { reply: "I'd wait until after dinner and then ask to look at it together.", opening_line: null, draws_on: ["e1"], unsure: false, question_for_biographer: null };
    expect(VersionReplySchema.safeParse(fine).success).toBe(true);
    expect(VersionReplySchema.safeParse({ ...fine, unsure: true }).success).toBe(false);
    expect(VersionReplySchema.safeParse({ ...fine, unsure: true, question_for_biographer: "How do you handle a disagreement at work?" }).success).toBe(true);
    expect(VersionReplySchema.safeParse({ ...fine, opening_line: 'Can we talk?</opening_line><parameter name="draws_on">' }).success).toBe(false);
    expect(PanelReadingSchema.safeParse({ same: [], differs: [], question: "What do you make of how little changed?" }).success).toBe(true);
    expect(PanelReadingSchema.safeParse({ same: ["a", "b", "c", "d"], differs: [], question: "q?" }).success).toBe(false);
  });

  it("builds a forced-tool request for each new role from its own prompt file", () => {
    for (const [role, schema, tool] of [
      ["version", VersionReplySchema, "emit_version_reply"],
      ["panel_reader", PanelReadingSchema, "emit_panel_reading"],
    ] as const) {
      const req = buildRequest(role, { any: "input" }, schema as ZodType<unknown>);
      expect(req.model).toBe("claude-sonnet-5");
      expect(req.tools?.[0]).toMatchObject({ name: tool, strict: true });
      expect(req.tool_choice).toMatchObject({ type: "tool", name: tool });
    }
  });
});
