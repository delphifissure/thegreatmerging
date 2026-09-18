/** The repair for tool parameters that the model wrote inside a neighbouring string field. */
import { describe, expect, it } from "vitest";
import { repairLeakedParameters } from "@/lib/llm/repair";
import { MentorReplySchema, VersionReplySchema } from "@/lib/llm/schemas";

describe("repairLeakedParameters", () => {
  it("moves a leaked parameter to the empty field the model named, and leaves the prose clean", () => {
    const raw = { reply: 'I say it straight when we sit down.</reply>\n<parameter name="opening_line">There\'s a charge on there that is mine.', opening_line: null, draws_on: ["e2"], unsure: false, question_for_biographer: null };
    const fixed = repairLeakedParameters(raw) as typeof raw;
    expect(fixed.reply).toBe("I say it straight when we sit down.");
    expect(fixed.opening_line).toBe("There's a charge on there that is mine.");
    expect(VersionReplySchema.safeParse(raw).success).toBe(false);
    expect(VersionReplySchema.safeParse(fixed).success).toBe(true);
  });

  it("recovers a leaked array, which is how the first avatar reply lost its citations", () => {
    const raw = { reply: 'I don\'t have that one.</reply>\n<parameter name="draws_on">["e1", "e4"]</parameter>\n<parameter name="unsure">false', draws_on: [], unsure: false, question_for_biographer: null };
    const fixed = repairLeakedParameters(raw) as typeof raw;
    expect(fixed).toMatchObject({ reply: "I don't have that one.", draws_on: ["e1", "e4"], unsure: false });
    expect(MentorReplySchema.safeParse(fixed).success).toBe(true);
  });

  it("never overwrites a field the model did fill, never creates a field, and drops what it cannot place", () => {
    const raw = { reply: 'Fine.</reply><parameter name="opening_line">leaked</parameter><parameter name="made_up">x</parameter><parameter name="draws_on">not json', opening_line: "the real one", draws_on: [] as string[] };
    const fixed = repairLeakedParameters(raw) as Record<string, unknown>;
    expect(fixed).toEqual({ reply: "Fine.", opening_line: "the real one", draws_on: [] });
  });

  it("cuts a bare closing tag at the end of the last field", () => {
    expect(repairLeakedParameters({ reply: "I'd wait until after dinner.</reply>\n</invoke>" })).toEqual({ reply: "I'd wait until after dinner." });
    expect(repairLeakedParameters({ reply: "I'd wait.</parameter>" })).toEqual({ reply: "I'd wait." });
  });

  it("leaves ordinary text alone, including angle brackets and a closing tag that is not the field's own", () => {
    const fine = { reply: "I spent < 10 minutes on it, and that's <fine>. She wrote </b> in the note.", draws_on: ["e1"], n: 3, nested: { reply: "x</reply>" } };
    expect(repairLeakedParameters(fine)).toEqual(fine);
    expect(repairLeakedParameters(null)).toBeNull();
    expect(repairLeakedParameters(["a</reply>"])).toEqual(["a</reply>"]);
    expect(repairLeakedParameters("a</reply>")).toBe("a</reply>");
  });
});
