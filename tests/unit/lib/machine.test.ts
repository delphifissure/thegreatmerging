/**
 * lib/color/machine against the real household (short) and parenting (long, with the
 * multi_caregiver condition) configs: queue construction, progress label, concreteness
 * follow-ups, skips, tags, the prober hand-off, probes and serializability.
 */
import { describe, expect, it } from "vitest";
import { loadColorModule } from "@/lib/color/config";
import {
  answersByStep,
  buildQueue,
  COLOR_STATES,
  currentItem,
  initMachine,
  isComplete,
  MachineError,
  progressLabel,
  reduce,
  type Action,
  type ColorModuleConfig,
  type InitContext,
  type MachineState,
} from "@/lib/color/machine";

const household = loadColorModule("household");
const parenting = loadColorModule("parenting");

const emptyCtx: InitContext = { needs_context_items: [], perception_gaps: [], polarization_gaps: [], multi_caregiver: false };
const fullCtx: InitContext = {
  needs_context_items: [
    { item_ref: "who_does_what_2", descriptor: "cooking", value: 8 },
    { item_ref: "fapbi_1", descriptor: "affection behavior 1", value: 3, pass: "acceptability" },
  ],
  perception_gaps: [{ item_ref: "acq_1", descriptor: "household chores", self_value: 1, partner_value: 4 }],
  polarization_gaps: [{ item_ref: "polarization_2", descriptor: "order in the home", self_alone: 2, self_with_partner: 6 }],
  multi_caregiver: false,
};

const AT = "2026-09-15T10:00:00.000Z";
const CONCRETE = "Last Tuesday my daughter asked to move the bookshelf and I said we should talk it over at dinner before touching anything in the shared room.";
const ABSTRACT_SHORT = "Talk about it first.";
const UNSURE = "I think we should talk about it when it matters and agree first.";
const PROBES: Extract<Action, { type: "probes_loaded" }>["probes"] = [
  { template_id: 4, question_text: "What's the value under this?", reason_text: "You tagged this a requirement and described a flexible split.", references: ["household_t3"] },
  { template_id: 7, question_text: "What would change your mind?", reason_text: "You said you could live without it and that it is a requirement.", references: ["household_p2"] },
];

function expectSerializable(s: MachineState) {
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

/** reduce with a fixed timestamp and a serializability check after every step. */
function step(s: MachineState, action: Action, config: ColorModuleConfig = household) {
  const withAt = "at" in action || action.type === "concreteness_result" || action.type === "probes_loaded" ? action : { ...action, at: AT };
  const r = reduce(s, withAt, config);
  expectSerializable(r.state);
  return r;
}

const answer = (text: string): Action => ({ type: "answer", text, at: AT });
const skip: Action = { type: "skip", at: AT };
const ids = (s: MachineState) => s.queue.map((q) => q.id);

/** Answer or tag every item up to (not including) the first item of `untilStep`. */
function advanceTo(s: MachineState, untilStep: MachineState["state"], config: ColorModuleConfig = household): MachineState {
  let st = s;
  for (let guard = 0; guard < 100; guard++) {
    const item = currentItem(st);
    if (!item || item.step === untilStep) return st;
    st = item.kind === "tag" ? step(st, { type: "tag", tag: "preference", comment: "A comment.", at: AT }, config).state : step(st, answer(CONCRETE), config).state;
  }
  throw new Error("advanceTo did not terminate");
}

describe("buildQueue / initMachine", () => {
  it("orders the household queue specifics, preference, tag, polarization, perception_gap, context with fixed ids", () => {
    const q = buildQueue(household, fullCtx);
    expect(q.map((x) => x.id)).toEqual([
      "household_s1",
      "household_p2",
      "household_p0",
      "household_t3",
      "polarization:polarization_2",
      "perception_gap:acq_1",
      "context:who_does_what_2",
      "context:fapbi_1:acceptability",
    ]);
    expect(q.map((x) => x.step)).toEqual(["specifics", "preference", "preference", "tag", "polarization", "perception_gap", "context", "context"]);
    const order = q.map((x) => COLOR_STATES.indexOf(x.step));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(q.map((x) => x.kind)).toEqual(["question", "question", "question", "tag", "question", "question", "question", "question"]);
  });

  it("substitutes the numbers into the fixed polarization and perception-gap text; context uses the fixed text", () => {
    const q = buildQueue(household, fullCtx);
    const byId = new Map(q.map((x) => [x.id, x]));
    expect(byId.get("polarization:polarization_2")).toMatchObject({
      item_ref: "polarization_2",
      text: "You said that left to yourself you're at 2 on this, and with your partner you find yourself at 6. What do you think is going on?",
    });
    expect(byId.get("perception_gap:acq_1")).toMatchObject({ item_ref: "acq_1", text: "You rated yourself 1 on this and your partner rated you 4. What are you each seeing?" });
    expect(byId.get("context:who_does_what_2")).toMatchObject({ item_ref: "who_does_what_2", text: household.common.context });
    expect(byId.get("context:fapbi_1:acceptability")).toMatchObject({ item_ref: "fapbi_1", text: "You flagged this one. What's the context?" });
    for (const x of q) expect(x.text).not.toMatch(/\{\w+\}/);
  });

  it("tags carry the fixed tag question and their topics", () => {
    const tag = buildQueue(household, emptyCtx).find((x) => x.kind === "tag")!;
    expect(tag).toMatchObject({ id: "household_t3", step: "tag", text: household.common.tag_question, topics: ["each other's things and spaces", "guests without notice"] });
  });

  it("parenting: multi_caregiver false excludes the Dimension 6 items, true includes them", () => {
    const without = buildQueue(parenting, emptyCtx);
    const withCg = buildQueue(parenting, { ...emptyCtx, multi_caregiver: true });
    const d6 = ["parenting_s23", "parenting_s24", "parenting_s25", "parenting_t26"];
    for (const id of d6) {
      expect(without.map((x) => x.id)).not.toContain(id);
      expect(withCg.map((x) => x.id)).toContain(id);
    }
    expect(without.some((x) => x.group === "d6")).toBe(false);
    expect(withCg.filter((x) => x.group === "d6").map((x) => x.id)).toEqual(d6);
    expect(without.filter((x) => x.step === "specifics")).toHaveLength(16);
    expect(withCg.filter((x) => x.step === "specifics")).toHaveLength(19);
    expect(without.filter((x) => x.step === "tag")).toHaveLength(4);
    expect(withCg.filter((x) => x.step === "tag")).toHaveLength(5);
    expect(withCg.map((x) => x.step)).toEqual([...Array<string>(19).fill("specifics"), ...Array<string>(3).fill("preference"), ...Array<string>(5).fill("tag")]);
  });

  it("initMachine starts in specifics at cursor 0 with a serializable state", () => {
    const s = initMachine(household, fullCtx);
    expect(s).toMatchObject({ version: 1, domain: "household", state: "specifics", cursor: 0, answers: [], followups_used: [], pending_concreteness: [], probes_requested: false, probes_loaded: false, completed_at: null });
    expect(ids(s)).toEqual(ids({ ...s, queue: buildQueue(household, fullCtx) }));
    expect(currentItem(s)?.id).toBe("household_s1");
    expectSerializable(s);
  });
});

describe("progressLabel", () => {
  it("reads 'Specifics, 1 of N' and advances per step", () => {
    let s = initMachine(household, fullCtx);
    expect(progressLabel(s, household)).toBe("Specifics, 1 of 1");
    s = step(s, answer(CONCRETE)).state;
    expect(progressLabel(s, household)).toBe("Preference, 1 of 2");
    s = step(s, answer(CONCRETE)).state;
    expect(progressLabel(s, household)).toBe("Preference, 2 of 2");
    s = step(s, answer(CONCRETE)).state;
    expect(progressLabel(s, household)).toBe("Requirement or preference, 1 of 1");
    s = step(s, { type: "tag", tag: "requirement", comment: "Ask first.", at: AT }).state;
    expect(progressLabel(s, household)).toBe("Polarization, 1 of 1");
    s = step(s, answer(CONCRETE)).state;
    expect(progressLabel(s, household)).toBe("Perception gap, 1 of 1");
    s = step(s, answer(CONCRETE)).state;
    expect(progressLabel(s, household)).toBe("Context, 1 of 2");
    s = step(s, skip).state;
    expect(progressLabel(s, household)).toBe("Context, 2 of 2");
  });

  it("parenting starts at 'Specifics, 1 of 16' (19 with a second caregiver)", () => {
    expect(progressLabel(initMachine(parenting, emptyCtx), parenting)).toBe("Specifics, 1 of 16");
    expect(progressLabel(initMachine(parenting, { ...emptyCtx, multi_caregiver: true }), parenting)).toBe("Specifics, 1 of 19");
  });

  it("counts a follow-up inside its step and reports the consistency and complete labels", () => {
    let s = initMachine(household, emptyCtx);
    s = step(s, answer(ABSTRACT_SHORT)).state;
    expect(progressLabel(s, household)).toBe("Specifics, 2 of 2");
    s = advanceTo(s, "consistency");
    expect(progressLabel(s, household)).toBe(household.common.transitions.consistency);
    s = step(s, { type: "probes_loaded", probes: [] }).state;
    expect(progressLabel(s, household)).toBe(household.common.transitions.complete);
  });
});

describe("answers and concreteness follow-ups", () => {
  it("a concrete answer is recorded and inserts no follow-up", () => {
    const s0 = initMachine(household, emptyCtx);
    const { state: s, effects } = step(s0, answer(CONCRETE));
    expect(s.answers).toEqual([{ question_id: "household_s1", step: "specifics", item_ref: undefined, answer_text: CONCRETE, skipped: false, answered_at: AT }]);
    expect(ids(s)).toEqual(ids(s0));
    expect(s.cursor).toBe(1);
    expect(s.state).toBe("preference");
    expect(effects).toEqual([{ type: "persist" }]);
    expect(s.followups_used).toEqual([]);
  });

  it("an abstract short answer inserts exactly one follow-up right after the question, and never a second one", () => {
    const s0 = initMachine(household, emptyCtx);
    const { state: s1, effects } = step(s0, answer(ABSTRACT_SHORT));
    expect(effects).toEqual([{ type: "persist" }]);
    expect(ids(s1)).toEqual(["household_s1", "household_s1:example", "household_p2", "household_p0", "household_t3"]);
    const followup = currentItem(s1)!;
    expect(followup).toEqual({
      id: "household_s1:example",
      step: "specifics",
      kind: "followup",
      text: "Can you give me a specific example?",
      item_ref: undefined,
      group: undefined,
      followup_of: "household_s1",
    });
    expect(s1.followups_used).toEqual(["household_s1"]);
    expect(s1.state).toBe("specifics");

    // Answering the follow-up abstractly does not add another follow-up.
    const { state: s2, effects: e2 } = step(s1, answer("Just be respectful."));
    expect(e2).toEqual([{ type: "persist" }]);
    expect(ids(s2)).toEqual(ids(s1));
    expect(s2.cursor).toBe(2);
    expect(currentItem(s2)?.id).toBe("household_p2");
    expect(s2.answers.map((a) => a.question_id)).toEqual(["household_s1", "household_s1:example"]);
    expect(answersByStep(s2, "specifics")).toHaveLength(2);
  });

  it("the trimmed answer is stored, and an empty answer throws", () => {
    const s0 = initMachine(household, emptyCtx);
    expect(() => reduce(s0, { type: "answer", text: "   " }, household)).toThrow(MachineError);
    expect(() => reduce(s0, { type: "answer", text: "" }, household)).toThrow(/answer is empty/);
    const s1 = step(s0, answer(`  ${CONCRETE}  `)).state;
    expect(s1.answers[0].answer_text).toBe(CONCRETE);
  });

  it("an unsure answer emits run_concreteness; concrete:false then inserts the follow-up at the cursor", () => {
    const s0 = initMachine(household, emptyCtx);
    const { state: s1, effects } = step(s0, answer(UNSURE));
    expect(effects).toEqual([{ type: "run_concreteness", question_id: "household_s1", question_text: household.specifics[0].text, answer_text: UNSURE }, { type: "persist" }]);
    expect(s1.pending_concreteness).toEqual(["household_s1"]);
    expect(ids(s1)).toEqual(ids(s0));
    expect(currentItem(s1)?.id).toBe("household_p2");

    const { state: s2, effects: e2 } = step(s1, { type: "concreteness_result", question_id: "household_s1", concrete: false });
    expect(e2).toEqual([{ type: "persist" }]);
    expect(s2.pending_concreteness).toEqual([]);
    expect(ids(s2)).toEqual(["household_s1", "household_s1:example", "household_p2", "household_p0", "household_t3"]);
    expect(currentItem(s2)).toMatchObject({ id: "household_s1:example", kind: "followup", followup_of: "household_s1" });
    expect(s2.state).toBe("specifics");
    expect(s2.followups_used).toEqual(["household_s1"]);

    // A second negative result for the same question cannot insert another follow-up.
    const s3 = step(s2, { type: "concreteness_result", question_id: "household_s1", concrete: false }).state;
    expect(ids(s3)).toEqual(ids(s2));
  });

  it("an unsure answer with concrete:true inserts nothing", () => {
    const s0 = initMachine(household, emptyCtx);
    const s1 = step(s0, answer(UNSURE)).state;
    const { state: s2, effects } = step(s1, { type: "concreteness_result", question_id: "household_s1", concrete: true });
    expect(effects).toEqual([{ type: "persist" }]);
    expect(ids(s2)).toEqual(ids(s0));
    expect(s2.pending_concreteness).toEqual([]);
    expect(s2.followups_used).toEqual([]);
    expect(currentItem(s2)?.id).toBe("household_p2");
  });

  it("concreteness applies to preference answers too, but not to polarization, perception gap or context answers", () => {
    let s = initMachine(household, fullCtx);
    s = step(s, answer(CONCRETE)).state;
    s = step(s, answer(ABSTRACT_SHORT)).state; // household_p2
    expect(currentItem(s)?.id).toBe("household_p2:example");
    s = step(s, answer(ABSTRACT_SHORT)).state; // the follow-up
    s = step(s, answer(CONCRETE)).state; // household_p0
    s = step(s, { type: "tag", tag: "requirement", comment: "Ask first.", at: AT }).state;
    const before = ids(s);
    let r = step(s, answer(ABSTRACT_SHORT)); // polarization
    expect(r.effects).toEqual([{ type: "persist" }]);
    r = step(r.state, answer(ABSTRACT_SHORT)); // perception gap
    expect(r.effects).toEqual([{ type: "persist" }]);
    r = step(r.state, answer(UNSURE)); // context
    expect(r.effects).toEqual([{ type: "persist" }]);
    expect(ids(r.state)).toEqual(before);
    expect(r.state.answers.find((a) => a.question_id === "polarization:polarization_2")).toMatchObject({ step: "polarization", item_ref: "polarization_2", answer_text: ABSTRACT_SHORT });
  });
});

describe("skip", () => {
  it("records skipped:true with a null answer and advances", () => {
    const s0 = initMachine(household, emptyCtx);
    const { state: s, effects } = step(s0, skip);
    expect(effects).toEqual([{ type: "persist" }]);
    expect(s.answers).toEqual([{ question_id: "household_s1", step: "specifics", item_ref: undefined, answer_text: null, skipped: true, answered_at: AT }]);
    expect(s.cursor).toBe(1);
    expect(currentItem(s)?.id).toBe("household_p2");
    expect(ids(s)).toEqual(ids(s0));
  });
});

describe("tags", () => {
  const atTag = () => advanceTo(initMachine(household, emptyCtx), "tag");

  it("cannot be skipped and cannot take a plain answer", () => {
    const s = atTag();
    expect(currentItem(s)).toMatchObject({ id: "household_t3", kind: "tag" });
    expect(() => reduce(s, { type: "skip" }, household)).toThrow(/cannot be skipped/);
    expect(() => reduce(s, { type: "answer", text: "It is a requirement." }, household)).toThrow(/need a tag action/);
  });

  it("requires a non-empty comment", () => {
    const s = atTag();
    expect(() => reduce(s, { type: "tag", tag: "requirement", comment: "   " }, household)).toThrow(/non-empty comment/);
  });

  it("records the tag and the comment and advances", () => {
    const s = atTag();
    const { state: next } = step(s, { type: "tag", tag: "requirement", comment: "  Ask before moving my things.  ", at: AT });
    expect(next.answers.at(-1)).toEqual({
      question_id: "household_t3",
      step: "tag",
      item_ref: undefined,
      answer_text: "Ask before moving my things.",
      skipped: false,
      tag: "requirement",
      comment: "Ask before moving my things.",
      answered_at: AT,
    });
    expect(next.cursor).toBe(s.cursor + 1);
  });

  it("a tag action on a non-tag item throws", () => {
    expect(() => reduce(initMachine(household, emptyCtx), { type: "tag", tag: "preference", comment: "x" }, household)).toThrow(/not a tag/);
  });
});

describe("end of queue: consistency, prober and probes", () => {
  it("entering consistency emits run_prober exactly once and leaves nothing to show", () => {
    const s = advanceTo(initMachine(household, emptyCtx), "tag");
    const { state: done, effects } = step(s, { type: "tag", tag: "preference", comment: "A comment.", at: AT });
    expect(effects).toEqual([{ type: "run_prober" }, { type: "persist" }]);
    expect(done.state).toBe("consistency");
    expect(done.probes_requested).toBe(true);
    expect(done.probes_loaded).toBe(false);
    expect(currentItem(done)).toBeNull();
    expect(isComplete(done)).toBe(false);
    expect(() => reduce(done, { type: "answer", text: "x" }, household)).toThrow(/no current question/);
    expect(() => reduce(done, { type: "skip" }, household)).toThrow(/nothing to skip/);
    // A stray concreteness result while waiting does not re-request the prober.
    const again = step(done, { type: "concreteness_result", question_id: "household_s1", concrete: true });
    expect(again.effects).toEqual([{ type: "persist" }]);
    expect(again.state.state).toBe("consistency");
  });

  it("probes_loaded with zero probes completes the domain", () => {
    const waiting = advanceTo(initMachine(household, emptyCtx), "consistency");
    const { state: s, effects } = step(waiting, { type: "probes_loaded", probes: [] });
    expect(effects).toEqual([{ type: "persist" }]);
    expect(s.state).toBe("complete");
    expect(isComplete(s)).toBe(true);
    expect(s.probes_loaded).toBe(true);
    expect(s.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(currentItem(s)).toBeNull();
    expect(ids(s)).toEqual(["household_s1", "household_p2", "household_p0", "household_t3"]);
  });

  it("probes_loaded with two probes appends two probe items with their reasons, then completes after answering and skipping", () => {
    const waiting = advanceTo(initMachine(household, emptyCtx), "consistency");
    const { state: s1, effects } = step(waiting, { type: "probes_loaded", probes: PROBES });
    expect(effects).toEqual([{ type: "persist" }]);
    expect(s1.state).toBe("consistency");
    expect(ids(s1).slice(-2)).toEqual(["probe:1", "probe:2"]);
    expect(s1.queue.at(-2)).toEqual({ id: "probe:1", step: "consistency", kind: "probe", text: PROBES[0].question_text, reason_text: PROBES[0].reason_text, template_id: 4 });
    expect(s1.queue.at(-1)).toEqual({ id: "probe:2", step: "consistency", kind: "probe", text: PROBES[1].question_text, reason_text: PROBES[1].reason_text, template_id: 7 });
    expect(currentItem(s1)?.id).toBe("probe:1");
    expect(progressLabel(s1, household)).toBe("A few follow-ups, written from your own answers. Each says why it is being asked, and skipping is fine., 1 of 2");

    const r2 = step(s1, answer("Because it keeps the peace."));
    expect(r2.effects).toEqual([{ type: "persist" }]);
    expect(r2.state.state).toBe("consistency");
    expect(currentItem(r2.state)?.id).toBe("probe:2");
    const r3 = step(r2.state, skip);
    expect(r3.effects).toEqual([{ type: "persist" }]);
    expect(r3.state.state).toBe("complete");
    expect(isComplete(r3.state)).toBe(true);
    expect(answersByStep(r3.state, "consistency")).toEqual([
      { question_id: "probe:1", step: "consistency", item_ref: undefined, answer_text: "Because it keeps the peace.", skipped: false, answered_at: AT },
      { question_id: "probe:2", step: "consistency", item_ref: undefined, answer_text: null, skipped: true, answered_at: AT },
    ]);
  });

  it("probes_loaded is idempotent and caps at three probes", () => {
    const waiting = advanceTo(initMachine(household, emptyCtx), "consistency");
    const s1 = step(waiting, { type: "probes_loaded", probes: PROBES }).state;
    const s2 = step(s1, { type: "probes_loaded", probes: PROBES }).state;
    expect(ids(s2)).toEqual(ids(s1));
    expect(s2).toEqual(s1);
    const four = [...PROBES, ...PROBES];
    const s3 = step(waiting, { type: "probes_loaded", probes: four }).state;
    expect(ids(s3).filter((id) => id.startsWith("probe:"))).toEqual(["probe:1", "probe:2", "probe:3"]);
  });

  it("run_prober is never emitted a second time", () => {
    let effectsSeen = 0;
    let s = initMachine(household, emptyCtx);
    const actions: Action[] = [answer(CONCRETE), answer(CONCRETE), answer(CONCRETE), { type: "tag", tag: "preference", comment: "c", at: AT }, { type: "probes_loaded", probes: PROBES }, answer("x"), answer("y")];
    for (const a of actions) {
      const r = step(s, a);
      effectsSeen += r.effects.filter((e) => e.type === "run_prober").length;
      s = r.state;
    }
    expect(effectsSeen).toBe(1);
    expect(s.state).toBe("complete");
    const completedAt = s.completed_at;
    // Further reductions on a complete machine keep completed_at.
    const r = step(s, { type: "concreteness_result", question_id: "household_s1", concrete: true });
    expect(r.state.completed_at).toBe(completedAt);
    expect(r.state.state).toBe("complete");
  });
});

describe("a full parenting session", () => {
  it("walks every state in order and stays serializable throughout", () => {
    const ctx: InitContext = { ...fullCtx, multi_caregiver: true, polarization_gaps: [{ item_ref: "polarization_1", descriptor: "structure with a child", self_alone: 6, self_with_partner: 2 }] };
    let s = initMachine(parenting, ctx);
    const seen: string[] = [];
    let proberEffects = 0;
    for (let guard = 0; guard < 200 && !isComplete(s); guard++) {
      if (!seen.includes(s.state)) seen.push(s.state);
      const item = currentItem(s);
      let r;
      if (!item) r = step(s, { type: "probes_loaded", probes: PROBES }, parenting);
      else if (item.kind === "tag") r = step(s, { type: "tag", tag: "requirement", comment: "Because.", at: AT }, parenting);
      else r = step(s, guard % 3 === 0 ? skip : answer(CONCRETE), parenting);
      proberEffects += r.effects.filter((e) => e.type === "run_prober").length;
      s = r.state;
    }
    expect(isComplete(s)).toBe(true);
    expect(seen).toEqual(["specifics", "preference", "tag", "polarization", "perception_gap", "context", "consistency"]);
    expect(proberEffects).toBe(1);
    expect(s.answers).toHaveLength(s.queue.length);
    expect(s.answers.filter((a) => a.step === "tag").every((a) => a.tag === "requirement" && a.comment === "Because.")).toBe(true);
    expect(s.queue.find((q) => q.id === "polarization:polarization_1")?.text).toBe(
      "You said that left to yourself you're at 6 on this, and with your partner you find yourself at 2. What do you think is going on?",
    );
    expect(ids(s).slice(-2)).toEqual(["probe:1", "probe:2"]);
  });
});
