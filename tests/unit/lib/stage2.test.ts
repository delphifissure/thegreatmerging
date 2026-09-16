/**
 * lib/interpretation/stage2: mental-health masking by consent, the interpreter input, the
 * code-generated mental-health sentences, private-result merging and the candidate lists.
 * Stage 1 outputs come from runStage1 over helper-built couples (tests/unit/helpers/responses.ts).
 */
import { descriptorContext } from "@/lib/llm/static_context";
import { describe, expect, it } from "vitest";
import { checkTextDeterministic } from "@/lib/guardrails";
import { INSTRUMENTS, isMentalHealthKey, MENTAL_HEALTH_KEYS } from "@/instruments/registry";
import type { Score } from "@/instruments/schema";
import { runStage1 } from "@/lib/interpretation/stage1";
import { buildInterpreterInput, computeCandidates, maskScores, mentalHealthSentences, privateResultsFor, type InterpreterInput } from "@/lib/interpretation/stage2";
import type { InterpreterOutput } from "@/lib/llm/schemas";
import { completeCouple, responsesFrom, setItem, setItems } from "@/tests/unit/helpers/responses";

const PHQ_12 = responsesFrom("phq9", { phq9_1: 3, phq9_2: 3, phq9_3: 3, phq9_4: 3 });
const GAD_11 = responsesFrom("gad7", { gad7_1: 3, gad7_2: 3, gad7_3: 3, gad7_4: 2 });

const distressed = completeCouple({ include: ["oci_r"], a: { phq9: PHQ_12 }, b: { gad7: GAD_11 } });
const stage1 = runStage1(distressed);
const responses = { a: distressed.a, b: distressed.b };

/** Every object anywhere in a JSON tree that carries a mental-health instrument_key, with its path. */
function mentalObjects(value: unknown, path = "$"): Array<{ path: string; obj: Record<string, unknown> }> {
  if (Array.isArray(value)) return value.flatMap((v, i) => mentalObjects(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const own = typeof obj.instrument_key === "string" && isMentalHealthKey(obj.instrument_key) ? [{ path, obj }] : [];
    return [...own, ...Object.entries(obj).flatMap(([k, v]) => mentalObjects(v, `${path}.${k}`))];
  }
  return [];
}

function numericLeaves(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(numericLeaves);
  return [];
}

describe("fixture", () => {
  it("the distressed couple has PHQ-9 12 for a, GAD-7 11 for b, and distress_context true", () => {
    expect(stage1.scores.a.find((s) => s.instrument_key === "phq9" && s.subscale === "total")).toMatchObject({ value: 12, cutoff_label: "moderate" });
    expect(stage1.scores.b.find((s) => s.instrument_key === "gad7" && s.subscale === "total")).toMatchObject({ value: 11, cutoff_label: "moderate" });
    expect(stage1.distress_context).toBe(true);
    for (const key of MENTAL_HEALTH_KEYS) expect(stage1.scores.a.some((s) => s.instrument_key === key)).toBe(true);
  });
});

describe("maskScores", () => {
  it("masks only phq9, gad7 and oci_r when share_mental_health_scores is false", () => {
    const masked = maskScores(stage1.scores.a, false);
    expect(masked).toHaveLength(stage1.scores.a.length);
    let mentalCount = 0;
    stage1.scores.a.forEach((s, i) => {
      if (isMentalHealthKey(s.instrument_key)) {
        mentalCount++;
        expect(masked[i]).toEqual({ instrument_key: s.instrument_key, subscale: s.subscale, value: "masked", cutoff_label: "masked" });
      } else {
        expect(masked[i]).toEqual({ instrument_key: s.instrument_key, subscale: s.subscale, value: s.value, cutoff_label: s.cutoff_label, ...(s.unvalidated ? { unvalidated: true } : {}) });
        expect(masked[i].value).not.toBe("masked");
      }
    });
    expect(mentalCount).toBeGreaterThanOrEqual(3);
    expect(new Set(masked.filter((m) => m.value === "masked").map((m) => m.instrument_key))).toEqual(new Set(MENTAL_HEALTH_KEYS));
  });

  it("masks nothing when share_mental_health_scores is true", () => {
    const open = maskScores(stage1.scores.a, true);
    expect(open.some((m) => m.value === "masked" || m.cutoff_label === "masked")).toBe(false);
    expect(open.find((m) => m.instrument_key === "phq9")).toEqual({ instrument_key: "phq9", subscale: "total", value: 12, cutoff_label: "moderate" });
  });

  it("carries the unvalidated flag through", () => {
    const out = maskScores([{ instrument_key: "polarization", subscale: "x", value: 1, cutoff_label: null, scoring_version: "1", unvalidated: true }], false);
    expect(out).toEqual([{ instrument_key: "polarization", subscale: "x", value: 1, cutoff_label: null, unvalidated: true }]);
  });
});

describe("buildInterpreterInput", () => {
  const consentCases: Array<[a: boolean, b: boolean]> = [
    [false, false],
    [false, true],
    [true, false],
  ];

  it.each(consentCases)("with consent a=%s b=%s no numeric mental-health value leaks and 'masked' appears (walked over the JSON)", (a, b) => {
    const input = buildInterpreterInput(stage1, responses, { a: { share_mental_health_scores: a }, b: { share_mental_health_scores: b } });
    const json = JSON.stringify(input);
    expect(json).toContain("masked");
    const found = mentalObjects(input);
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const { path, obj } of found) {
      const side = path.startsWith("$.scores_a") ? a : path.startsWith("$.scores_b") ? b : null;
      expect(side).not.toBeNull(); // mental-health keys appear only under scores_a / scores_b
      if (!side) {
        expect(obj.value).toBe("masked");
        expect(obj.cutoff_label).toBe("masked");
        expect(numericLeaves(obj)).toEqual([]);
      } else {
        expect(typeof obj.value).toBe("number");
      }
    }
    // Nothing outside the per-person score lists mentions a mental-health instrument.
    const rest: Partial<InterpreterInput> = { ...input };
    delete rest.scores_a;
    delete rest.scores_b;
    expect(JSON.stringify(rest)).not.toMatch(/phq9|gad7|oci_r/);
  });

  it("with both consents the numeric totals are present", () => {
    const input = buildInterpreterInput(stage1, responses, { a: { share_mental_health_scores: true }, b: { share_mental_health_scores: true } });
    expect(JSON.stringify(input)).not.toContain("masked");
    expect(input.scores_a.find((s) => s.instrument_key === "phq9")).toMatchObject({ value: 12, cutoff_label: "moderate" });
    expect(input.scores_b.find((s) => s.instrument_key === "gad7")).toMatchObject({ value: 11, cutoff_label: "moderate" });
  });

  it("carries distress_context, flags by domain, candidates and the unvalidated instrument list; descriptors live in the static system context", () => {
    const flagged = completeCouple({ a: { map: (rs) => setItems(rs, [["map_1", 60, "intensity"], ["map_1", 20, "efficacy"]]) } });
    const s1 = runStage1(flagged);
    const input = buildInterpreterInput(s1, { a: flagged.a, b: flagged.b }, { a: { share_mental_health_scores: false }, b: { share_mental_health_scores: false } });
    expect(input.distress_context).toBe(false);
    expect(Object.keys(input.flags_by_domain)).toEqual(["household"]);
    expect(input.flags_by_domain.household).toEqual([{ rule_key: "map_high_intensity_low_efficacy", weight: 3, label: undefined, triggered_by: s1.flags[0].triggered_by }]);
    expect(input.unvalidated_instruments).toEqual(["polarization"]);
    expect("descriptors" in input).toBe(false);
    expect(descriptorContext()).toContain('"acq_1":"household chores"');
    expect(descriptorContext()).toContain('"map_1":"problem area: money"');
    expect(input.aligned_candidates.length).toBeLessThanOrEqual(60);
    expect(input.misaligned_candidates).toEqual([]);
    expect(input.aligned_candidates.some((c) => c.item === "map_1")).toBe(false);
    expect(input.couple_scores.find((c) => c.metric === "polarization_loop")).toMatchObject({ unvalidated: true });
    expect(input.couple_scores.find((c) => c.metric === "wdw_now_disagreement")).not.toHaveProperty("unvalidated");
  });
});

describe("mentalHealthSentences", () => {
  const scores: Score[] = [
    { instrument_key: "phq9", subscale: "total", value: 12, cutoff_label: "moderate", scoring_version: "1.0.0" },
    { instrument_key: "gad7", subscale: "total", value: 3, cutoff_label: null, scoring_version: "1.0.0" },
    { instrument_key: "oci_r", subscale: "washing", value: 4, cutoff_label: null, scoring_version: "1.0.0" },
    { instrument_key: "phq9", subscale: "item9", value: 0, cutoff_label: null, scoring_version: "1.0.0" },
    { instrument_key: "csi16", subscale: "total", value: 70, cutoff_label: "non_distressed", scoring_version: "1.0.0" },
    { instrument_key: "ecr_r", subscale: "anxiety", value: 3.1, cutoff_label: null, scoring_version: "1.0.0" },
  ];

  it("produces one sentence per mental-health total only, naming the cutoff and the privacy note", () => {
    const out = mentalHealthSentences(scores);
    expect(out.map((s) => s.instrument_key)).toEqual(["phq9", "gad7"]);
    expect(out[0].sentence).toBe(
      "Your Patient Health Questionnaire-9 (PHQ-9) total is 12, in the moderate range. Screener result; clinical evaluation required. This number is private to you unless you choose to share it.",
    );
    expect(out[1].sentence).toContain(`Your ${INSTRUMENTS.gad7.definition.name} total is 3, in the no published cutoff range.`);
    for (const s of out) expect(checkTextDeterministic(s.sentence)).toEqual([]);
  });

  it("replaces underscores in cutoff labels", () => {
    const [s] = mentalHealthSentences([{ instrument_key: "phq9", subscale: "total", value: 17, cutoff_label: "moderately_severe", scoring_version: "1.0.0" }]);
    expect(s.sentence).toContain("in the moderately severe range");
  });
});

describe("privateResultsFor", () => {
  const output: InterpreterOutput = {
    distress_note: "Relationship scores are read under distress this time.",
    domains: [],
    private_summaries: [
      {
        user: "a",
        sentences: [
          { instrument_key: "phq9", sentence: "MODEL PHQ SENTENCE" },
          { instrument_key: "csi16", sentence: "Your CSI-16 total is 70, in the non distressed range." },
          { instrument_key: "gad7", sentence: "MODEL GAD SENTENCE" },
          { instrument_key: "oci_r", sentence: "MODEL OCI SENTENCE" },
        ],
      },
      { user: "b", sentences: [{ instrument_key: "rdas", sentence: "Your RDAS total is 60, in the non distressed range." }] },
    ],
  };

  it("puts code-generated mental-health sentences first and drops the model's mental-health sentences", () => {
    const own = stage1.scores.a;
    const res = privateResultsFor("a", output, own, stage1);
    expect(res.sentences[0].instrument_key).toBe("phq9");
    expect(res.sentences[0].sentence).toContain("total is 12, in the moderate range. Screener result; clinical evaluation required.");
    const mhFromCode = mentalHealthSentences(own);
    expect(res.sentences.slice(0, mhFromCode.length)).toEqual(mhFromCode);
    expect(res.sentences.slice(mhFromCode.length)).toEqual([{ instrument_key: "csi16", sentence: "Your CSI-16 total is 70, in the non distressed range." }]);
    expect(JSON.stringify(res)).not.toContain("MODEL ");
    expect(res.distress_note).toBe(output.distress_note);
    expect(res.flagged_domains).toEqual(stage1.domains.map((d) => ({ domain: d.domain, weight: d.weight, flag_count: d.flag_count })));
    expect(res.perception_gaps).toBe(stage1.perception_gaps.a);
    expect(res.generated_label).toBe("Sentences other than instrument scores are generated by the interpreter; not validated.");
  });

  it("drops a model mental-health sentence even when there is no code-generated one for that instrument", () => {
    const res = privateResultsFor("a", output, [{ instrument_key: "csi16", subscale: "total", value: 70, cutoff_label: "non_distressed", scoring_version: "1" }], stage1);
    expect(res.sentences).toEqual([{ instrument_key: "csi16", sentence: "Your CSI-16 total is 70, in the non distressed range." }]);
  });

  it("selects the other user's summary for side b", () => {
    const res = privateResultsFor("b", output, [], stage1);
    expect(res.sentences).toEqual([{ instrument_key: "rdas", sentence: "Your RDAS total is 60, in the non distressed range." }]);
    expect(res.perception_gaps).toBe(stage1.perception_gaps.b);
  });
});

describe("computeCandidates", () => {
  const benign = completeCouple();
  const benignStage1 = runStage1(benign);
  const byPrefix = (list: Array<{ item: string }>, prefix: string) => list.filter((c) => c.item.startsWith(prefix));

  it("the benign couple yields aligned entries from every comparable instrument and no misaligned ones", () => {
    const { aligned, misaligned } = computeCandidates(benignStage1, { a: benign.a, b: benign.b });
    expect(misaligned).toEqual([]);
    expect(byPrefix(aligned, "rdas_").map((c) => c.item)).toEqual(["rdas_1", "rdas_2", "rdas_3", "rdas_4", "rdas_5", "rdas_6"]);
    expect(byPrefix(aligned, "acq_")).toHaveLength(34);
    expect(byPrefix(aligned, "who_does_what_")).toHaveLength(24);
    expect(byPrefix(aligned, "map_")).toHaveLength(10);
    expect(byPrefix(aligned, "fapbi_")).toHaveLength(20);
    expect(aligned).toHaveLength(94);
    expect(aligned.find((c) => c.item === "rdas_1")).toEqual({ domain: "social_family_longterm", item: "rdas_1", descriptor: "consensus item 1", a: 5, b: 5 });
    expect(aligned.find((c) => c.item === "acq_1")).toEqual({ domain: "household", item: "acq_1", descriptor: "household chores", a: 0, b: 0 });
    expect(aligned.find((c) => c.item === "fapbi_1")).toMatchObject({ domain: "intimacy", a: 9, b: 9 });
  });

  it("RDAS consensus: a gap of 2 is misaligned; a flagged item (2 or below) is in neither list", () => {
    const gap = completeCouple({ a: { rdas: (rs) => setItem(rs, "rdas_1", 3) } });
    const s1 = runStage1(gap);
    expect(s1.flags).toEqual([]);
    const { aligned, misaligned } = computeCandidates(s1, { a: gap.a, b: gap.b });
    expect(misaligned).toEqual([{ domain: "social_family_longterm", item: "rdas_1", descriptor: "consensus item 1", a: 3, b: 5 }]);
    expect(aligned.some((c) => c.item === "rdas_1")).toBe(false);

    const flagged = completeCouple({ a: { rdas: (rs) => setItem(rs, "rdas_1", 2) } });
    const s2 = runStage1(flagged);
    expect(s2.flags.map((f) => f.rule_key)).toEqual(["rdas_consensus_disagree"]);
    const both = computeCandidates(s2, { a: flagged.a, b: flagged.b });
    expect([...both.aligned, ...both.misaligned].some((c) => c.item === "rdas_1")).toBe(false);
  });

  it("ACQ: opposite small pulls are misaligned; equal non-zero pulls are neither", () => {
    const opposite = completeCouple({
      a: { acq: (rs) => setItems(rs, [["acq_1", 1, "self"], ["acq_1", -1, "partner_wants"]]) },
      b: { acq: (rs) => setItems(rs, [["acq_1", -1, "self"], ["acq_1", 1, "partner_wants"]]) },
    });
    const s1 = runStage1(opposite);
    expect(s1.flags).toEqual([]);
    const { aligned, misaligned } = computeCandidates(s1, { a: opposite.a, b: opposite.b });
    expect(misaligned).toEqual([{ domain: "household", item: "acq_1", descriptor: "household chores", a: 1, b: -1 }]);
    expect(aligned.some((c) => c.item === "acq_1")).toBe(false);

    const same = completeCouple({ a: { acq: (rs) => setItem(rs, "acq_1", 1, "self") }, b: { acq: (rs) => setItem(rs, "acq_1", 1, "self") } });
    const res = computeCandidates(runStage1(same), { a: same.a, b: same.b });
    expect([...res.aligned, ...res.misaligned].some((c) => c.item === "acq_1")).toBe(false);
  });

  it("Who Does What: a now-versus-ideal gap or disagreement of exactly 2 is misaligned", () => {
    const wdw = completeCouple({ a: { who_does_what: (rs) => setItem(rs, "who_does_what_1", 7, "now") } });
    const s1 = runStage1(wdw);
    expect(s1.flags).toEqual([]);
    const { aligned, misaligned } = computeCandidates(s1, { a: wdw.a, b: wdw.b });
    expect(misaligned).toEqual([{ domain: "household", item: "who_does_what_1", descriptor: "planning meals", a: 7, b: 5 }]);
    expect(aligned.some((c) => c.item === "who_does_what_1")).toBe(false);
  });

  it("MAP: both below 25 is aligned, a 30-point intensity difference is misaligned, in between is neither", () => {
    const far = completeCouple({ a: { map: (rs) => setItem(rs, "map_1", 40, "intensity") } });
    const s1 = runStage1(far);
    expect(s1.flags).toEqual([]);
    expect(computeCandidates(s1, { a: far.a, b: far.b }).misaligned).toEqual([{ domain: "household", item: "map_1", descriptor: "problem area: money", a: 40, b: 0 }]);

    const low = completeCouple({ a: { map: (rs) => setItem(rs, "map_1", 10, "intensity") }, b: { map: (rs) => setItem(rs, "map_1", 10, "intensity") } });
    expect(computeCandidates(runStage1(low), { a: low.a, b: low.b }).aligned.find((c) => c.item === "map_1")).toMatchObject({ a: 10, b: 10 });

    const mid = completeCouple({ a: { map: (rs) => setItem(rs, "map_1", 30, "intensity") }, b: { map: (rs) => setItem(rs, "map_1", 20, "intensity") } });
    const res = computeCandidates(runStage1(mid), { a: mid.a, b: mid.b });
    expect([...res.aligned, ...res.misaligned].some((c) => c.item === "map_1")).toBe(false);
  });

  it("FAPBI: both at 7 or above is aligned, both at 5 or 6 is misaligned, a flagged (4 or below) item is dropped", () => {
    const mid = completeCouple({ a: { fapbi: (rs) => setItem(rs, "fapbi_1", 6, "acceptability") }, b: { fapbi: (rs) => setItem(rs, "fapbi_1", 6, "acceptability") } });
    const s1 = runStage1(mid);
    expect(s1.flags).toEqual([]);
    expect(computeCandidates(s1, { a: mid.a, b: mid.b }).misaligned).toEqual([{ domain: "intimacy", item: "fapbi_1", descriptor: "affection behavior 1", a: 6, b: 6 }]);

    const flagged = completeCouple({ a: { fapbi: (rs) => setItem(rs, "fapbi_1", 3, "acceptability") } });
    const s2 = runStage1(flagged);
    expect(s2.flags.map((f) => f.rule_key)).toEqual(["fapbi_unacceptable"]);
    const res = computeCandidates(s2, { a: flagged.a, b: flagged.b });
    expect([...res.aligned, ...res.misaligned].some((c) => c.item === "fapbi_1")).toBe(false);
  });

  it("never reads mental-health instruments", () => {
    const { aligned, misaligned } = computeCandidates(stage1, responses);
    expect(JSON.stringify([...aligned, ...misaligned])).not.toMatch(/phq9|gad7|oci_r/);
  });
});
