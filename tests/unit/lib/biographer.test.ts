/**
 * Intervention prototype, pure parts: text encryption, the free-text safety screen, the output
 * schemas' rules, and the builders that decide what each role sees and what is kept from a draft.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { decryptText, encryptText, generateKeyBase64, loadKey } from "@/lib/crypto";
import { screenText, SAFETY_TEXT_MESSAGES } from "@/lib/safety_text";
import { BiographerTurnSchema, DrafterOutputSchema, MentorReplySchema } from "@/lib/llm/schemas";
import { buildBiographerInput, buildMentorInput, cleanReferences, entriesFromDraft, FOCI, focusByKey, mentorReadiness, seqOfTurnId } from "@/lib/biographer/inputs";
import { buildRequest } from "@/lib/llm";
import { checkOutputDeterministic } from "@/lib/guardrails";
import type { DocumentEntry, Turn } from "@/lib/data/biographer";

const key = loadKey(generateKeyBase64());
const ctx = { user_id: "u1", instrument_key: "conversation", field: "content" };

const turn = (seq: number, role: Turn["role"], text: string): Turn => ({ id: `id-${seq}`, seq, role, text, note: null, meta: {}, rating: null, created_at: new Date(0) });
const entry = (id: string, document: DocumentEntry["document"], section: string, text: string, status: DocumentEntry["status"] = "ratified", mark: DocumentEntry["mark"] = "open"): DocumentEntry => ({
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

describe("encryptText", () => {
  it("round-trips unicode and hides the plaintext", () => {
    const secret = "My father left when I was nine — nobody talked about it. 🫥";
    const blob = encryptText(secret, ctx, key);
    expect(blob.toString("utf8")).not.toContain("father");
    expect(decryptText(blob, ctx, key)).toBe(secret);
  });

  it("binds a ciphertext to its user and column, and never repeats itself", () => {
    const blob = encryptText("same words", ctx, key);
    expect(() => decryptText(blob, { ...ctx, user_id: "u2" }, key)).toThrow();
    expect(() => decryptText(blob, { ...ctx, field: "note" }, key)).toThrow();
    expect(encryptText("same words", ctx, key).equals(blob)).toBe(false);
  });
});

describe("screenText", () => {
  it("fires on self-harm and on fear of a partner, and has a message for each", () => {
    expect(screenText("Some nights I think everyone would be better off dead without me")).toBe("self_harm");
    expect(screenText("honestly i want to die")).toBe("self_harm");
    expect(screenText("I'm scared of him when he drinks")).toBe("fear_of_partner");
    expect(screenText("She threatened to take the kids if I left")).toBe("fear_of_partner");
    expect(screenText("he won't let me see my friends")).toBe("fear_of_partner");
    expect(SAFETY_TEXT_MESSAGES.self_harm).toContain("988");
    expect(SAFETY_TEXT_MESSAGES.fear_of_partner).toContain("1-800-799-7233");
  });

  it("stays quiet on ordinary hard material", () => {
    for (const t of ["We fought about money and I went quiet for two days.", "I was afraid of my father when he shouted.", "The deadline is killing me this week.", "I hit a wall with the budget."]) expect(screenText(t)).toBeNull();
  });
});

describe("output schemas", () => {
  const base = { reflection: "", question: "What happened next?", why: "I want to follow the moment you started.", kind: "follow_up" as const, references: ["t2"], suggest_stopping: false };
  it("a discrepancy question must point at the two things it places side by side", () => {
    expect(BiographerTurnSchema.safeParse(base).success).toBe(true);
    expect(BiographerTurnSchema.safeParse({ ...base, kind: "discrepancy", references: ["t2"] }).success).toBe(false);
    expect(BiographerTurnSchema.safeParse({ ...base, kind: "discrepancy", references: ["t2", "t6"] }).success).toBe(true);
  });

  it("a drafted line must sit in a section of its own document", () => {
    const line = { document: "history" as const, section: "family" as const, text: "I grew up in a loud house.", in_their_words: true, source_turn_ids: ["t2"], suggested_mark: "open" as const };
    expect(DrafterOutputSchema.safeParse({ entries: [line] }).success).toBe(true);
    expect(DrafterOutputSchema.safeParse({ entries: [{ ...line, section: "values" }] }).success).toBe(false);
    expect(DrafterOutputSchema.safeParse({ entries: [{ ...line, source_turn_ids: [] }] }).success).toBe(false);
  });

  it("an unsure avatar must hand a question to the biographer", () => {
    expect(MentorReplySchema.safeParse({ reply: "I don't know how I'd handle that.", draws_on: [], unsure: true, question_for_biographer: null }).success).toBe(false);
    expect(MentorReplySchema.safeParse({ reply: "I don't know how I'd handle that.", draws_on: [], unsure: true, question_for_biographer: "What do you do when a plan changes at the last minute?" }).success).toBe(true);
  });
});

describe("input builders", () => {
  const turns = [turn(1, "guide", "Who handled the money?"), turn(2, "person", "My mother. We never talked about it."), turn(3, "guide", "What did silence teach you?"), turn(4, "person", "That asking is rude.")];

  it("gives the biographer short turn ids, ratified lines only, and at most five open questions", () => {
    const input = buildBiographerInput({ personName: "Ana", focus: focusByKey("money")!, turns, entries: [entry("a", "constitution", "values", "I value openness about money."), entry("b", "constitution", "fears", "draft", "proposed")], openQuestions: ["1", "2", "3", "4", "5", "6"] });
    expect(input.turns.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(input.ratified).toEqual([{ document: "constitution", section: "values", text: "I value openness about money." }]);
    expect(input.open_questions).toHaveLength(5);
    expect(JSON.stringify(input)).not.toContain("id-2");
  });

  it("keeps only drafted lines that rest on something the person said", () => {
    const kept = entriesFromDraft(
      {
        entries: [
          { document: "history", section: "money_modelled", text: " My mother handled the money and we never talked about it. ", in_their_words: true, source_turn_ids: ["t2"], suggested_mark: "open" },
          { document: "constitution", section: "fears", text: "Rests only on the biographer's words.", in_their_words: false, source_turn_ids: ["t3"], suggested_mark: "open" },
          { document: "constitution", section: "values", text: "Points at a turn that does not exist.", in_their_words: false, source_turn_ids: ["t9", "nonsense"], suggested_mark: "open" },
        ],
      },
      turns,
    );
    expect(kept).toEqual([{ document: "history", section: "money_modelled", text: "My mother handled the money and we never talked about it.", mark: "open", in_their_words: true, source_turns: [2] }]);
  });

  it("drops references to turns that do not exist", () => {
    expect(seqOfTurnId("t12")).toBe(12);
    expect(seqOfTurnId("12")).toBeNull();
    expect(cleanReferences({ reflection: "", question: "q", why: "w", kind: "discrepancy", references: ["t2", "t4", "t40"], suggest_stopping: false }, turns)).toEqual([2, 4]);
  });

  it("the avatar waits for enough ratified lines and a direction", () => {
    const five = ["values", "lived", "gaps", "requirements", "fears"].map((s, i) => entry(`e${i}`, "constitution", s, `line ${i}`));
    expect(mentorReadiness(five)).toMatchObject({ ready: false, hasDirection: false, ratifiedConstitution: 5 });
    expect(mentorReadiness([...five.slice(0, 4), entry("w", "constitution", "working_on", "Asking before I defend.")]).ready).toBe(true);
    expect(mentorReadiness([...five, entry("w", "constitution", "working_on", "only a draft", "proposed")]).ready).toBe(false);
  });

  it("gives the avatar ratified lines with short ids that map back, and never a proposed or rejected line", () => {
    const built = buildMentorInput({
      personName: "Ana",
      entries: [entry("db-1", "constitution", "requirements", "I need honesty about money.", "ratified", "settled"), entry("db-2", "history", "family", "Loud house."), entry("db-3", "constitution", "fears", "not signed", "proposed"), entry("db-4", "constitution", "values", "thrown out", "rejected")],
      turns: [turn(1, "person", "We argued about the card bill.")],
    });
    expect(built.input.constitution).toEqual([{ id: "e1", section: "requirements", text: "I need honesty about money.", mark: "settled" }]);
    expect(built.input.history).toEqual([{ id: "e2", section: "family", text: "Loud house.", mark: "open" }]);
    expect(built.entryIdOf("e1")).toBe("db-1");
    expect(built.entryIdOf("e9")).toBeNull();
    expect(JSON.stringify(built.input)).not.toMatch(/not signed|thrown out|db-/);
  });

  it("every focus has a fixed opening question and lands in real sections", () => {
    expect(FOCI.length).toBeGreaterThanOrEqual(4);
    for (const f of FOCI) expect(f.opening.trim().endsWith("?")).toBe(true);
  });
});

describe("requests and guardrails for the new roles", () => {
  it("builds a forced-tool request for each role from its own prompt file", () => {
    for (const [role, schema, tool] of [
      ["biographer", BiographerTurnSchema, "emit_biographer_turn"],
      ["drafter", DrafterOutputSchema, "emit_document_entries"],
      ["mentor", MentorReplySchema, "emit_mentor_reply"],
    ] as const) {
      const req = buildRequest(role, { any: "input" }, schema as ZodType<unknown>);
      expect(req.model).toBe("claude-sonnet-5");
      expect(req.tools?.[0]).toMatchObject({ name: tool, strict: true });
      expect(req.tool_choice).toMatchObject({ type: "tool", name: tool });
      expect(JSON.stringify(req.tools?.[0])).not.toMatch(/"(minLength|maxLength|minItems|maxItems)"/);
    }
  });

  it("the pattern filter passes warm first-person speech and blocks labels and verdicts", () => {
    const fine = { reply: "I remember that week. What has helped me lately is asking one question before I explain myself. It still feels hard in the moment." };
    expect(checkOutputDeterministic(fine).ok).toBe(true);
    expect(checkOutputDeterministic({ reply: "She is controlling, and honestly you two are incompatible." }).ok).toBe(false);
    expect(checkOutputDeterministic({ question: "It sounds like you have an anxiety disorder. Have you thought of that?" }).ok).toBe(false);
  });
});

describe("leaked tool markup", () => {
  it("is rejected in any text a person would read, so the wrapper retries instead of showing it", () => {
    const leaked = 'I don\'t have that one.</reply>\n<parameter name="draws_on">["e1"]';
    expect(MentorReplySchema.safeParse({ reply: leaked, draws_on: [], unsure: false, question_for_biographer: null }).success).toBe(false);
    expect(BiographerTurnSchema.safeParse({ reflection: "", question: 'What happened?</question><parameter name="why">', why: "w", kind: "open", references: [], suggest_stopping: false }).success).toBe(false);
    // Ordinary angle brackets and comparisons are fine.
    expect(MentorReplySchema.safeParse({ reply: "I spent < 10 minutes on it, and that's <fine>.", draws_on: [], unsure: false, question_for_biographer: null }).success).toBe(true);
  });
});
