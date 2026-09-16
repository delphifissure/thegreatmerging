/**
 * lib/brief/build: the summarizer input for one domain, honouring consent for verbatim quoting,
 * excluding tag steps, marking consistency notes, computing parked items and carrying the
 * unvalidated label on polarization loops.
 */
import { describe, expect, it } from "vitest";
import { buildSummarizerInput, orderBriefs } from "@/lib/brief/build";
import type { Flag, PerceptionGap } from "@/lib/interpretation/stage1";
import type { BriefDomain, InterpreterOutput } from "@/lib/llm/schemas";

type Input = Parameters<typeof buildSummarizerInput>[0];
type Side = Input["a"];
type Answer = Side["answers"][number];

function answer(patch: Partial<Answer> & { id: string; step: string }): Answer {
  return { question_id: patch.id, question_text: "Q", answer_text: "An answer.", skipped: false, shareable_verbatim: false, item_ref: null, ...patch };
}

const sideA: Side = {
  consent: { share_written_answers_verbatim: true },
  answers: [
    answer({ id: "a1", step: "specifics", answer_text: "I would ask before moving anything.", shareable_verbatim: true }),
    answer({ id: "a2", step: "preference", answer_text: "A calm week.", shareable_verbatim: false }),
    answer({ id: "a3", step: "tag", answer_text: "Ask first.", shareable_verbatim: true }),
    answer({ id: "a4", step: "perception_gap", item_ref: "acq_1", answer_text: "I do more than she notices." }),
    answer({ id: "a5", step: "consistency", answer_text: "I meant weekdays only.", shareable_verbatim: true }),
    answer({ id: "a6", step: "consistency", answer_text: null, skipped: true, shareable_verbatim: true }),
    answer({ id: "a7", step: "context", item_ref: "who_does_what_2", answer_text: "I cook because I get home first." }),
    answer({ id: "a8", step: "context", item_ref: "map_1", answer_text: null, skipped: true }),
  ],
  tags: [{ item_ref: "household_t3", tag: "requirement", comment: "Ask before moving my things." }],
};

const sideB: Side = {
  consent: { share_written_answers_verbatim: false },
  answers: [
    answer({ id: "b1", step: "specifics", answer_text: "I would just do it.", shareable_verbatim: true }),
    answer({ id: "b2", step: "consistency", answer_text: "I meant weekends.", shareable_verbatim: true }),
    answer({ id: "b3", step: "perception_gap", item_ref: "acq_1", answer_text: null, skipped: true }),
    answer({ id: "b4", step: "tag", answer_text: "Fine either way.", shareable_verbatim: true }),
  ],
  tags: [{ item_ref: "unknown_ref", tag: "preference", comment: "Fine either way." }],
};

const flags: Flag[] = [
  { domain: "household", rule_key: "polarization_loop", weight: 2, label: "shared_pattern", triggered_by: { instrument: "polarization", item: "polarization_2", user: "both", values: { a_gap: 3, b_gap: -2 }, unvalidated: true } },
  { domain: "parenting", rule_key: "polarization_loop", weight: 2, label: "shared_pattern", triggered_by: { instrument: "polarization", item: "polarization_1", user: "both", values: { a_gap: 2, b_gap: -2 }, unvalidated: true } },
  { domain: "household", rule_key: "needs_context", weight: 1, label: "context", triggered_by: { instrument: "who_does_what", item: "who_does_what_2", user: "a", values: { value: 8 } } },
  { domain: "household", rule_key: "needs_context", weight: 1, label: "context", triggered_by: { instrument: "map", item: "map_1", user: "a", values: { value: 70 } } },
  { domain: "household", rule_key: "map_high_intensity_low_efficacy", weight: 3, triggered_by: { instrument: "map", item: "map_1", user: "b", values: { intensity: 70, efficacy: 20 } } },
  { domain: "intimacy", rule_key: "fapbi_unacceptable", weight: 2, triggered_by: { instrument: "fapbi", item: "fapbi_1", user: "b", values: { acceptability: 2, frequency: 3 } } },
  { domain: "household", rule_key: "brief_crs_negative_coparenting", weight: 3, triggered_by: { instrument: "brief_crs", user: "a", values: { subscale: "undermining", value: 4 } } },
];

const perceptionGaps: { a: PerceptionGap[]; b: PerceptionGap[] } = {
  a: [
    { instrument: "acq", item_ref: "acq_1", descriptor: "household chores", domain: "household", self_value: 1, partner_value: 4, gap: 3 },
    { instrument: "acq", item_ref: "acq_6", descriptor: "affection", domain: "intimacy", self_value: 0, partner_value: 2, gap: 2 },
  ],
  b: [{ instrument: "polarization", item_ref: "polarization_2", descriptor: "order in the home", domain: "household", self_value: 6, partner_value: 3, gap: 3, unvalidated: true }],
};

const interpretation: InterpreterOutput = {
  distress_note: null,
  domains: [
    { domain: "household", aligned: [{ item: "cooking", one_sentence: "You both said cooking is shared." }], low_intensity_misaligned: [], flagged: [] },
    { domain: "parenting", aligned: [{ item: "bedtime", one_sentence: "You both said 8pm." }], low_intensity_misaligned: [], flagged: [] },
  ],
  private_summaries: [
    { user: "a", sentences: [] },
    { user: "b", sentences: [] },
  ],
};

const descriptors: Record<string, string> = {
  acq_1: "household chores",
  polarization_2: "order in the home",
  who_does_what_2: "cooking",
  map_1: "problem area: money",
  household_t3: "each other's things and spaces",
};

const base: Input = { domain: "household", a: sideA, b: sideB, flags, perceptionGaps, interpretation, descriptors };

describe("buildSummarizerInput", () => {
  const out = buildSummarizerInput(base);

  it("excludes tag steps from the answers and keeps every other step", () => {
    expect(out.answers_a.map((a) => a.answer_id)).toEqual(["a1", "a2", "a4", "a5", "a6", "a7", "a8"]);
    expect(out.answers_b.map((a) => a.answer_id)).toEqual(["b1", "b2", "b3"]);
    expect(out.answers_a[0]).toEqual({ answer_id: "a1", step: "specifics", question_id: "a1", question_text: "Q", answer_text: "I would ask before moving anything.", skipped: false, shareable_verbatim: true });
  });

  it("marks shareable_verbatim only when the couple-level switch is on and the answer was marked", () => {
    const byId = (list: typeof out.answers_a, id: string) => list.find((a) => a.answer_id === id)!;
    expect(byId(out.answers_a, "a1").shareable_verbatim).toBe(true);
    expect(byId(out.answers_a, "a2").shareable_verbatim).toBe(false);
    // B marked b1 shareable, but B's couple-level switch is off.
    expect(byId(out.answers_b, "b1").shareable_verbatim).toBe(false);
    expect(out.answers_b.every((a) => a.shareable_verbatim === false)).toBe(true);
    const flipped = buildSummarizerInput({ ...base, b: { ...sideB, consent: { share_written_answers_verbatim: true } } });
    expect(flipped.answers_b.find((a) => a.answer_id === "b1")?.shareable_verbatim).toBe(true);
  });

  it("consistency notes carry the share flag and skip empty or skipped ones", () => {
    expect(out.consistency_notes).toEqual([
      { user: "a", note: "I meant weekdays only.", share: true },
      { user: "b", note: "I meant weekends.", share: false },
    ]);
  });

  it("parked items are flagged items in this domain that nobody wrote about (skipped does not count), deduplicated by descriptor", () => {
    // polarization_2 (loop) and map_1 (context + MAP flags, twice) have no non-skipped answer; who_does_what_2 has a7.
    expect(out.parked_items).toEqual(["order in the home", "problem area: money"]);
    const nobodyWrote = buildSummarizerInput({ ...base, a: { ...sideA, answers: sideA.answers.filter((a) => a.id !== "a7") } });
    expect(nobodyWrote.parked_items).toEqual(["order in the home", "cooking", "problem area: money"]);
    const bWrote = buildSummarizerInput({ ...base, b: { ...sideB, answers: [...sideB.answers, answer({ id: "b5", step: "context", item_ref: "map_1", answer_text: "Money is tight." })] } });
    expect(bWrote.parked_items).toEqual(["order in the home"]);
    // A flag in another domain (fapbi_1, intimacy) is never parked here.
    expect(out.parked_items).not.toContain("fapbi_1");
  });

  it("polarization loops are limited to this domain and carry unvalidated: true with the gaps", () => {
    expect(out.polarization_loops).toEqual([{ dimension: "polarization_2", descriptor: "order in the home", a_gap: 3, b_gap: -2, unvalidated: true }]);
    const parentingOut = buildSummarizerInput({ ...base, domain: "parenting" });
    expect(parentingOut.polarization_loops).toEqual([{ dimension: "polarization_1", descriptor: "polarization_1", a_gap: 2, b_gap: -2, unvalidated: true }]);
  });

  it("perception gaps merge both sides' refs for this domain with each person's explanation", () => {
    expect(out.perception_gaps).toEqual([
      { item_ref: "acq_1", descriptor: "household chores", a_self: 1, b_about_a: 4, a_explanation: "I do more than she notices.", b_explanation: null },
      { item_ref: "polarization_2", descriptor: "order in the home", a_self: null, b_about_a: null, a_explanation: null, b_explanation: null },
    ]);
  });

  it("tags get descriptors, falling back to the item ref", () => {
    expect(out.tags_a).toEqual([{ item_ref: "household_t3", descriptor: "each other's things and spaces", tag: "requirement", comment: "Ask before moving my things." }]);
    expect(out.tags_b).toEqual([{ item_ref: "unknown_ref", descriptor: "unknown_ref", tag: "preference", comment: "Fine either way." }]);
  });

  it("aligned items come from the interpretation for this domain, or are empty without one", () => {
    expect(out.aligned_items).toEqual(["cooking"]);
    expect(buildSummarizerInput({ ...base, interpretation: null }).aligned_items).toEqual([]);
    expect(buildSummarizerInput({ ...base, domain: "conflict" }).aligned_items).toEqual([]);
  });

  it("the domain and the overall shape are carried through", () => {
    expect(out.domain).toBe("household");
    expect(Object.keys(out).sort()).toEqual(["aligned_items", "answers_a", "answers_b", "consistency_notes", "domain", "parked_items", "perception_gaps", "polarization_loops", "tags_a", "tags_b"]);
  });
});

describe("orderBriefs", () => {
  it("sorts by domain weight descending without mutating the input", () => {
    const brief = (domain: BriefDomain["domain"]): BriefDomain => ({
      domain,
      what_each_would_do: { a: "a", b: "b" },
      values_underneath: { a: "a", b: "b" },
      tags_side_by_side: [],
      perception_gaps: [],
      polarization_loops: [],
      consistency_notes: [],
      aligned_items: [],
      parked_items: [],
    });
    const briefs = [brief("household"), brief("parenting"), brief("intimacy")];
    const ordered = orderBriefs(briefs, [
      { domain: "parenting", weight: 7 },
      { domain: "intimacy", weight: 9 },
    ]);
    expect(ordered.map((b) => b.domain)).toEqual(["intimacy", "parenting", "household"]);
    expect(briefs.map((b) => b.domain)).toEqual(["household", "parenting", "intimacy"]);
  });
});
