/** Replay of a remembered argument, pure parts: what an avatar is shown, how recognition is scored, when a replay stops. */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { MoveCodeSchema, RehearsalTurnSchema } from "@/lib/llm/schemas";
import { buildMoveCoderInput, buildRehearsalInput, cleanAccount, cleanSpeech, nextSpeaker, rehearsalEntries, rehearsalReadiness, replayIsOver, type Frame } from "@/lib/replay/inputs";
import { endingOf, MOVE_DID, MOVE_I, MOVE_THEY, MOVES, recognition, REMEMBERED_MOVES, resolvedTooEasily, type CodedTurn } from "@/lib/replay/moves";
import { registersFor } from "@/lib/biographer/voice";
import { buildRequest } from "@/lib/llm";
import type { DocumentEntry } from "@/lib/data/biographer";

const entry = (id: string, section: string, text: string, tier: DocumentEntry["tier"], more: Partial<DocumentEntry> = {}): DocumentEntry => ({ id, document: "constitution", section, text, status: "ratified", mark: "open", tier, in_their_words: true, source_thread_id: null, source_turns: [], ratified_at: null, created_at: new Date(0), ...more });
const frame: Frame = { label: "The card statement in March", setting: "A weeknight, in the kitchen", firstSpeaker: "partner", openingLine: "Can we go through the statement tonight?" };
const BEN = "ben-id";
const ANA = "ana-id";

describe("what a rehearsal avatar is shown", () => {
  const entries = [
    entry("p1", "fears", "That she'll leave if she sees how anxious I am about money.", "private"),
    entry("a1", "conflict", "I explain at length before I ask anything.", "avatar_only"),
    entry("s1", "requirements", "We never hide anything about money.", "shareable", { mark: "settled" }),
    entry("d1", "values", "only a draft", "shareable", { status: "proposed" }),
    entry("h1", "money_modelled", "We lost the house when I was twelve.", "avatar_only", { document: "history" }),
  ];

  it("never includes a private line or a draft, and marks what may be said out loud", () => {
    expect(rehearsalEntries(entries).map((e) => e.id)).toEqual(["a1", "s1", "h1"]);
    const built = buildRehearsalInput({ me: { id: BEN, name: "Ben" }, partnerName: "Ana", entries, frame, stateBefore: "Home late, hadn't eaten.", turns: [] });
    expect(built.input.constitution).toEqual([
      { id: "e1", section: "conflict", text: "I explain at length before I ask anything.", mark: "open", may_say: false },
      { id: "e2", section: "requirements", text: "We never hide anything about money.", mark: "settled", may_say: true },
    ]);
    expect(built.input.history).toHaveLength(1);
    expect(JSON.stringify(built.input)).not.toMatch(/she'll leave|only a draft|"p1"|"a1"/);
    expect(built.entryIdOf("e2")).toBe("s1");
  });

  it("is told the scene and its person's state, and nothing about what anyone remembers doing", () => {
    const turns = [
      { speakerId: ANA, says: frame.openingLine, does: null },
      { speakerId: BEN, says: "Now?", does: "keeps looking at the laptop" },
    ];
    const input = buildRehearsalInput({ me: { id: BEN, name: "Ben" }, partnerName: "Ana", entries, frame, stateBefore: "Home late, hadn't eaten.", turns, maxTurns: 12 }).input;
    expect(input.scene).toEqual({ what_it_was_about: frame.label, where_and_when: frame.setting });
    expect(input.your_state).toBe("Home late, hadn't eaten.");
    expect(input.so_far).toEqual([
      { who: "Ana", says: frame.openingLine, does: null },
      { who: "you", says: "Now?", does: "keeps looking at the laptop" },
    ]);
    expect(input.exchanges_left).toBe(10);
    expect(Object.keys(input)).not.toContain("my_moves");
    expect(JSON.stringify(input)).not.toMatch(/ana-id|ben-id/);
  });

  it("carries its person's coaching as things it knows about itself, a handful at most, and none when there is none", () => {
    const base = { me: { id: BEN, name: "Ben" }, partnerName: "Ana", entries, frame, stateBefore: "tired", turns: [] };
    expect(buildRehearsalInput(base).input.in_moments_like_this).toEqual([]);
    const notes = ["  Here I don't explain. I say 'not now' and go and eat.  ", "", ...Array.from({ length: 8 }, (_, i) => `note ${i}`)];
    const coached = buildRehearsalInput({ ...base, coaching: notes }).input.in_moments_like_this;
    expect(coached[0]).toBe("Here I don't explain. I say 'not now' and go and eat.");
    expect(coached).toHaveLength(6);
  });

  it("needs five constitution lines it may use, and says how many there are without saying what they are", () => {
    expect(rehearsalReadiness(entries)).toMatchObject({ ready: false, usable: 3, constitution: 2, ratified: 4, needed: 5 });
    const five = Array.from({ length: 5 }, (_, i) => entry(`x${i}`, "values", `line ${i}`, "avatar_only"));
    expect(rehearsalReadiness(five).ready).toBe(true);
    expect(rehearsalReadiness(five.map((e) => ({ ...e, tier: "private" as const }))).ready).toBe(false);
  });

  it("hears how its person sounds in an argument, which the one-notch-ahead self never does", () => {
    expect(registersFor("rehearsal")).toContain("heated");
    expect(registersFor("mentor")).not.toContain("heated");
  });

  it("the move coder is shown words and A or B, never a name or an id", () => {
    const input = buildMoveCoderInput(
      [
        { speakerId: ANA, says: "one", does: null },
        { speakerId: BEN, says: "two", does: null },
        { speakerId: ANA, says: "three", does: null },
        { speakerId: BEN, says: "four", does: null },
        { speakerId: ANA, says: null, does: "leaves the room" },
      ],
      ANA,
    );
    expect(input.earlier.map((t) => t.says)).toEqual(["two", "three", "four"]);
    expect(input.turn_to_code).toEqual({ speaker: "A", says: null, does: "leaves the room" });
    expect(JSON.stringify(input)).not.toMatch(/ana-id|ben-id/);
  });
});

describe("speech", () => {
  it("loses the quotation marks a model wraps it in or leaves hanging, and nothing else", () => {
    expect(cleanSpeech('"Fine, sit there."')).toBe("Fine, sit there.");
    expect(cleanSpeech("I'm eating, that's it.\"")).toBe("I'm eating, that's it.");
    expect(cleanSpeech("\u201cNow?\u201d")).toBe("Now?");
    expect(cleanSpeech('She said "later" again.')).toBe('She said "later" again.');
    expect(cleanSpeech("  ")).toBeNull();
    expect(cleanSpeech(null)).toBeNull();
  });
});

describe("running order and stopping", () => {
  it("alternates from whoever spoke first", () => {
    expect(nextSpeaker([], [ANA, BEN])).toBe(ANA);
    expect(nextSpeaker([{ speakerId: ANA }], [ANA, BEN])).toBe(BEN);
    expect(nextSpeaker([{ speakerId: ANA }, { speakerId: BEN }], [ANA, BEN])).toBe(ANA);
  });

  it("stops when someone ends it, when the turns run out, or when nobody has spoken twice running", () => {
    const t = (says: string | null, ends = false) => ({ speakerId: ANA, says, does: says ? null : "says nothing", ends });
    expect(replayIsOver([])).toBe(false);
    expect(replayIsOver([t("a"), t("b")])).toBe(false);
    expect(replayIsOver([t("a"), t("fine.", true)])).toBe(true);
    expect(replayIsOver([t("a"), t(null), t(null)])).toBe(true);
    expect(replayIsOver([t("a"), t(null), t("b")])).toBe(false);
    expect(replayIsOver(Array.from({ length: 12 }, () => t("x")))).toBe(true);
    expect(replayIsOver(Array.from({ length: 4 }, () => t("x")), 4)).toBe(true);
  });
});

describe("recognition, scored in code", () => {
  const turns: CodedTurn[] = [
    { speaker: ANA, move: "asks", remembered: true },
    { speaker: BEN, move: "explains" },
    { speaker: ANA, move: "criticizes" },
    { speaker: BEN, move: "defends" },
    { speaker: ANA, move: "criticizes" },
    { speaker: BEN, move: "withdraws" },
    { speaker: ANA, move: "other" },
  ];

  it("sets what a person remembers doing beside what their avatar did, ignoring order", () => {
    const r = recognition(["withdraws", "explains", "proposes"], turns, BEN);
    expect(r.matched).toEqual(["explains", "withdraws"]);
    expect(r.onlyRemembered).toEqual(["proposes"]);
    expect(r.onlyAvatar).toEqual([]);
    expect(r.overlap).toBeCloseTo(2 / 3);
  });

  it("counts explaining and defending as one act, and going quiet and leaving as one, and a turn's second move too", () => {
    // Ben ticked "I explained myself"; the coder, from outside, called the same turns defending.
    const coded: CodedTurn[] = [{ speaker: BEN, move: "defends" }, { speaker: BEN, move: "leaves", secondary: "criticizes" }];
    const r = recognition(["explains", "withdraws"], coded, BEN);
    expect(r.matched).toEqual(["explains", "withdraws"]);
    expect(r.onlyRemembered).toEqual([]);
    expect(r.onlyAvatar).toEqual(["criticizes"]);
    expect(r.overlap).toBeCloseTo(2 / 3);
  });

  it("leaves out the opening line, which came from the couple and not from an avatar, and ignores 'other'", () => {
    const r = recognition(["asks", "criticizes"], turns, ANA);
    expect(r.matched).toEqual(["criticizes"]);
    expect(r.onlyRemembered).toEqual(["asks"]);
    expect(r.onlyAvatar).toEqual([]);
    expect(recognition([], [], ANA)).toEqual({ matched: [], onlyRemembered: [], onlyAvatar: [], overlap: 0 });
  });

  it("reads how a replay ended from its last moves", () => {
    expect(endingOf(turns.slice(0, 6))).toBe("one_left");
    expect(endingOf([{ speaker: ANA, move: "proposes" }, { speaker: BEN, move: "agrees" }])).toBe("agreed");
    expect(endingOf([{ speaker: ANA, move: "criticizes" }, { speaker: BEN, move: "owns" }, { speaker: ANA, move: "states_position" }])).toBe("repaired");
    expect(endingOf([{ speaker: ANA, move: "criticizes" }, { speaker: BEN, move: "defends" }, { speaker: ANA, move: "criticizes" }, { speaker: BEN, move: "disagrees" }])).toBe("escalated");
    expect(endingOf([{ speaker: ANA, move: "states_position" }, { speaker: BEN, move: "explains" }])).toBe("unresolved");
    expect(endingOf([])).toBe("unresolved");
  });

  it("flags a replay that made peace at once, because model avatars agree too easily", () => {
    expect(resolvedTooEasily([{ speaker: ANA, move: "asks", remembered: true }, { speaker: BEN, move: "owns" }, { speaker: ANA, move: "appreciates" }, { speaker: BEN, move: "agrees" }])).toBe(true);
    expect(resolvedTooEasily(turns)).toBe(false);
  });

  it("every move has words for the timeline and for both tick lists; 'other' is never offered as a memory", () => {
    for (const m of MOVES) expect(MOVE_DID[m]).toBeTruthy();
    expect(REMEMBERED_MOVES).not.toContain("other");
    for (const m of REMEMBERED_MOVES) {
      expect(MOVE_I[m as keyof typeof MOVE_I].startsWith("I ")).toBe(true);
      expect(MOVE_THEY[m as keyof typeof MOVE_THEY]).toBeTruthy();
    }
  });
});

describe("accounts and schemas", () => {
  it("an account needs a state, at least one move of one's own and an ending; unknown ticks are dropped", () => {
    expect(cleanAccount({ stateBefore: " tired ", myMoves: ["explains", "explains", "made_up", "other"], theirMoves: ["asks"], ending: "one_left", notes: " x " })).toEqual({ stateBefore: "tired", myMoves: ["explains"], theirMoves: ["asks"], ending: "one_left", notes: "x" });
    expect(cleanAccount({ stateBefore: "tired", myMoves: ["made_up"], theirMoves: [], ending: "one_left" })).toBeNull();
    expect(cleanAccount({ stateBefore: "  ", myMoves: ["asks"], theirMoves: [], ending: "one_left" })).toBeNull();
    expect(cleanAccount({ stateBefore: "tired", myMoves: ["asks"], theirMoves: [], ending: "happily" })).toBeNull();
  });

  it("a turn must say or do something, and its numbers stay between -2 and 2", () => {
    const ok = { impact: -1, intent: 0, does: null, ends: false, draws_on: ["e1"], says: "Now? I've just got in." };
    expect(RehearsalTurnSchema.safeParse(ok).success).toBe(true);
    expect(RehearsalTurnSchema.safeParse({ ...ok, says: null, does: "leaves the room", ends: true }).success).toBe(true);
    expect(RehearsalTurnSchema.safeParse({ ...ok, says: null, does: null }).success).toBe(false);
    expect(RehearsalTurnSchema.safeParse({ ...ok, intent: 3 }).success).toBe(false);
    expect(RehearsalTurnSchema.safeParse({ ...ok, impact: null }).success).toBe(true);
    expect(MoveCodeSchema.safeParse({ move: "withdraws", secondary: null }).success).toBe(true);
    expect(MoveCodeSchema.safeParse({ move: "sulks", secondary: null }).success).toBe(false);
  });

  it("builds forced-tool requests; the avatars and the coder run on different models", () => {
    const avatar = buildRequest("rehearsal", { any: "input" }, RehearsalTurnSchema as ZodType<unknown>);
    const coder = buildRequest("move_coder", { any: "input" }, MoveCodeSchema as ZodType<unknown>);
    expect(avatar.tool_choice).toMatchObject({ type: "tool", name: "emit_rehearsal_turn" });
    expect(coder.tool_choice).toMatchObject({ type: "tool", name: "emit_move" });
    expect(avatar.model).not.toBe(coder.model);
  });
});
