/**
 * computeCoupleScores: ACQ perceptual accuracy, Who Does What mirroring, CPQ demand-withdraw directions,
 * MAP area detection, PSDQ gaps, polarization loops, and the guarantee that mental-health instruments
 * never reach the output. Thresholds are the defaults (miss >= 2, disagreement >= 3, intensity >= 50 and
 * efficacy <= 50, |gap| >= 2), which equal config/flag_rules.json.
 */
import { describe, expect, it } from "vitest";
import { computeCoupleScores, DEFAULT_COUPLE_THRESHOLDS, type PartnerData } from "@/instruments/couple";
import type { Response } from "@/instruments/schema";
import { coupleThresholdsFromRules, scoreAll } from "@/lib/interpretation/stage1";
import { benignResponses, completeCouple, constantResponses, fullResponses, setItem, setItems, type CoupleOverrides } from "@/tests/unit/helpers/responses";

function partners(overrides: CoupleOverrides = {}): [PartnerData, PartnerData] {
  const input = completeCouple(overrides);
  return [
    { responses: input.a, scores: scoreAll(input.a) },
    { responses: input.b, scores: scoreAll(input.b) },
  ];
}
const metric = (out: ReturnType<typeof computeCoupleScores>, name: string) => out.find((c) => c.metric === name)!;

describe("computeCoupleScores", () => {
  it("default thresholds equal the ones derived from config/flag_rules.json", () => {
    expect(coupleThresholdsFromRules()).toEqual(DEFAULT_COUPLE_THRESHOLDS);
    expect(DEFAULT_COUPLE_THRESHOLDS).toEqual({
      acq_perceptual_miss_at_or_above: 2,
      wdw_now_disagreement_at_or_above: 3,
      map_intensity_at_or_above: 50,
      map_efficacy_at_or_below: 50,
      polarization_gap_abs_at_or_above: 2,
    });
  });

  it("a benign couple: accuracy 1, no disagreements, no MAP areas, zero gaps, no loops", () => {
    const out = computeCoupleScores(...partners());
    expect(out.map((c) => c.metric)).toEqual([
      "acq_perceptual_accuracy_a_about_b",
      "acq_perceptual_accuracy_b_about_a",
      "wdw_now_disagreement",
      "cpq_a_demand_b_withdraw",
      "cpq_b_demand_a_withdraw",
      "map_high_intensity_low_efficacy",
      "psdq_gap_authoritative",
      "psdq_gap_authoritarian",
      "psdq_gap_permissive",
      "polarization_loop",
    ]);
    expect(metric(out, "acq_perceptual_accuracy_a_about_b")).toMatchObject({ value: 1, details: { compared: 34, misses: [], threshold: 2 } });
    expect(metric(out, "wdw_now_disagreement").value).toBe(0);
    expect(metric(out, "map_high_intensity_low_efficacy")).toMatchObject({ value: 0, details: { areas: [] } });
    expect(metric(out, "psdq_gap_permissive")).toMatchObject({ value: 0, details: { a: 3, b: 3, style: "permissive" } });
    expect(metric(out, "polarization_loop")).toMatchObject({ value: 0, unvalidated: true, details: { unvalidated: true } });
  });

  describe("ACQ perceptual accuracy", () => {
    it("value is the proportion of items where |perceived - actual| < 2; misses of 2+ are listed", () => {
      const [a, b] = partners({
        // b actually wants +3 on acq_1 and -2 on acq_2; a thinks 0 and -1 -> misses 3 (listed) and 1 (agree)
        b: { acq: (rs) => setItems(rs, [["acq_1", 3, "self"], ["acq_2", -2, "self"], ["acq_5", 2, "partner_wants"]]) },
        a: { acq: (rs) => setItems(rs, [["acq_1", 0, "partner_wants"], ["acq_2", -1, "partner_wants"]]) },
      });
      const out = computeCoupleScores(a, b);
      const aAboutB = metric(out, "acq_perceptual_accuracy_a_about_b");
      expect(aAboutB.value).toBe(33 / 34);
      expect(aAboutB.details).toEqual({
        compared: 34,
        threshold: 2,
        misses: [{ item_id: "acq_1", descriptor: "household chores", perceived: 0, actual: 3, miss: 3 }],
      });
      // b thinks a wants +2 on acq_5; a actually wants 0 -> miss exactly 2 counts
      const bAboutA = metric(out, "acq_perceptual_accuracy_b_about_a");
      expect(bAboutA.value).toBe(33 / 34);
      expect(bAboutA.details.misses).toEqual([{ item_id: "acq_5", descriptor: "time with relatives", perceived: 2, actual: 0, miss: 2 }]);
      expect(aAboutB.unvalidated).toBeUndefined();
    });

    it("a miss of 1 is not a miss; two planted misses give 32/34", () => {
      const [a, b] = partners({
        b: { acq: (rs) => setItems(rs, [["acq_3", 2, "self"], ["acq_4", -3, "self"], ["acq_6", 1, "self"]]) },
      });
      const out = computeCoupleScores(a, b);
      const aAboutB = metric(out, "acq_perceptual_accuracy_a_about_b");
      expect(aAboutB.value).toBe(32 / 34);
      expect((aAboutB.details.misses as Array<{ item_id: string }>).map((m) => m.item_id)).toEqual(["acq_3", "acq_4"]);
    });
  });

  describe("Who Does What mirroring", () => {
    it("a_now=2 and b_now=8 describe the same split (b mirrors to 2): disagreement 0", () => {
      const [a, b] = partners({
        a: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 2, "now"], ["who_does_what_1", 2, "ideal"]]) },
        b: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 8, "now"], ["who_does_what_1", 8, "ideal"]]) },
      });
      const cs = metric(computeCoupleScores(a, b), "wdw_now_disagreement");
      expect(cs.value).toBe(0);
      const items = cs.details.items as Array<{ item_id: string; a_now: number; b_now_mirrored: number; disagreement: number }>;
      expect(items.find((i) => i.item_id === "who_does_what_1")).toEqual({ item_id: "who_does_what_1", descriptor: "planning meals", a_now: 2, b_now_mirrored: 2, disagreement: 0 });
      expect(items).toHaveLength(24);
    });

    it("a_now=2 and b_now=2 (both say 'I do it all') mirror to 2 vs 8: disagreement 6, counted", () => {
      const [a, b] = partners({
        a: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 2, "now"], ["who_does_what_1", 2, "ideal"]]) },
        b: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 2, "now"], ["who_does_what_1", 2, "ideal"]]) },
      });
      const cs = metric(computeCoupleScores(a, b), "wdw_now_disagreement");
      expect(cs.value).toBe(1);
      const item = (cs.details.items as Array<{ item_id: string }>).find((i) => i.item_id === "who_does_what_1");
      expect(item).toMatchObject({ a_now: 2, b_now_mirrored: 8, disagreement: 6 });
      expect(cs.details.threshold).toBe(3);
    });

    it("disagreement of exactly 3 counts, 2 does not", () => {
      const [a3, b3] = partners({ b: { who_does_what: (rs) => setItems(rs, [["who_does_what_2", 2, "now"], ["who_does_what_2", 2, "ideal"]]) } }); // a 5 vs mirrored 8
      expect(metric(computeCoupleScores(a3, b3), "wdw_now_disagreement").value).toBe(1);
      const [a2, b2] = partners({ b: { who_does_what: (rs) => setItems(rs, [["who_does_what_2", 3, "now"], ["who_does_what_2", 3, "ideal"]]) } }); // a 5 vs mirrored 7
      expect(metric(computeCoupleScores(a2, b2), "wdw_now_disagreement").value).toBe(0);
    });
  });

  describe("CPQ demand-withdraw", () => {
    it("averages each direction across the two reporters", () => {
      // a self-demand = cpq_sf_7 + cpq_sf_9 = 8 + 6 = 14; b partner-demand = cpq_sf_8 + cpq_sf_10 = 4 + 2 = 6 -> (14 + 6) / 2 = 10
      // b self-demand = 1 + 1 = 2; a partner-demand = 3 + 5 = 8 -> (2 + 8) / 2 = 5
      const [a, b] = partners({
        a: { cpq_sf: (rs) => setItems(rs, [["cpq_sf_7", 8], ["cpq_sf_9", 6], ["cpq_sf_8", 3], ["cpq_sf_10", 5]]) },
        b: { cpq_sf: (rs) => setItems(rs, [["cpq_sf_8", 4], ["cpq_sf_10", 2], ["cpq_sf_7", 1], ["cpq_sf_9", 1]]) },
      });
      const out = computeCoupleScores(a, b);
      expect(metric(out, "cpq_a_demand_b_withdraw")).toEqual({ metric: "cpq_a_demand_b_withdraw", value: 10, details: { a_reports: 14, b_reports: 6 } });
      expect(metric(out, "cpq_b_demand_a_withdraw")).toEqual({ metric: "cpq_b_demand_a_withdraw", value: 5, details: { b_reports: 2, a_reports: 8 } });
    });
  });

  describe("MAP high intensity, low efficacy", () => {
    it("detects an area for one partner only, and for both", () => {
      const [a, b] = partners({
        // map_1: a at the inclusive boundary (50 / 50); b benign. map_3: both 80 / 20.
        a: { map: (rs) => setItems(rs, [["map_1", 50, "intensity"], ["map_1", 50, "efficacy"], ["map_3", 80, "intensity"], ["map_3", 20, "efficacy"]]) },
        b: { map: (rs) => setItems(rs, [["map_3", 80, "intensity"], ["map_3", 20, "efficacy"]]) },
      });
      const cs = metric(computeCoupleScores(a, b), "map_high_intensity_low_efficacy");
      expect(cs.value).toBe(2);
      expect(cs.details.areas).toEqual([
        { item_id: "map_1", descriptor: "problem area: money", by: ["a"], a: { intensity: 50, efficacy: 50 }, b: { intensity: 0, efficacy: 100 } },
        { item_id: "map_3", descriptor: "problem area: sex", by: ["a", "b"], a: { intensity: 80, efficacy: 20 }, b: { intensity: 80, efficacy: 20 } },
      ]);
      expect(cs.details).toMatchObject({ intensity_at_or_above: 50, efficacy_at_or_below: 50 });
    });

    it("just below either threshold is not an area", () => {
      const [a, b] = partners({
        a: { map: (rs) => setItems(rs, [["map_1", 49, "intensity"], ["map_1", 50, "efficacy"], ["map_2", 50, "intensity"], ["map_2", 51, "efficacy"]]) },
      });
      expect(metric(computeCoupleScores(a, b), "map_high_intensity_low_efficacy").value).toBe(0);
    });
  });

  describe("PSDQ between-parent gaps", () => {
    it("reports |a - b| per style", () => {
      // a permissive all 5, b all 3 -> gap 2; a authoritarian 4 vs b 3 -> 1; authoritative equal -> 0
      const permissive = ["psdq_sf_4", "psdq_sf_8", "psdq_sf_15", "psdq_sf_20", "psdq_sf_24"];
      const authoritarian = [2, 6, 10, 13, 16, 17, 19, 23, 26, 28, 30, 32].map((n) => `psdq_sf_${n}`);
      const [a, b] = partners({
        a: { psdq_sf: (rs) => setItems(rs, [...permissive.map((id): [string, number] => [id, 5]), ...authoritarian.map((id): [string, number] => [id, 4])]) },
      });
      const out = computeCoupleScores(a, b);
      expect(metric(out, "psdq_gap_permissive")).toEqual({ metric: "psdq_gap_permissive", value: 2, details: { a: 5, b: 3, style: "permissive" } });
      expect(metric(out, "psdq_gap_authoritarian")).toEqual({ metric: "psdq_gap_authoritarian", value: 1, details: { a: 4, b: 3, style: "authoritarian" } });
      expect(metric(out, "psdq_gap_authoritative").value).toBe(0);
    });
  });

  describe("polarization loops (unvalidated)", () => {
    const pol = (alone: number, withPartner: number, item = "polarization_1") => (rs: Response[]) =>
      setItems(rs, [[item, alone, "self_alone"], [item, withPartner, "self_with_partner"]]);
    const dims = (out: ReturnType<typeof computeCoupleScores>) =>
      metric(out, "polarization_loop").details.dimensions as Array<{ item_id: string; a_gap: number; b_gap: number; loop: boolean }>;

    it("opposite signs with both |gap| >= 2 is a loop", () => {
      const [a, b] = partners({ a: { polarization: pol(2, 5) }, b: { polarization: pol(6, 3) } }); // +3 / -3
      const out = computeCoupleScores(a, b);
      const cs = metric(out, "polarization_loop");
      expect(cs.value).toBe(1);
      expect(cs.unvalidated).toBe(true);
      expect(dims(out)[0]).toEqual({ item_id: "polarization_1", descriptor: "structure with a child", a_gap: 3, b_gap: -3, loop: true });
      expect(dims(out).filter((d) => d.loop)).toHaveLength(1);
      const [a2, b2] = partners({ a: { polarization: pol(5, 3) }, b: { polarization: pol(2, 4) } }); // -2 / +2 at the boundary
      expect(metric(computeCoupleScores(a2, b2), "polarization_loop").value).toBe(1);
    });

    it("same sign is not a loop", () => {
      const [a, b] = partners({ a: { polarization: pol(2, 5) }, b: { polarization: pol(1, 4) } }); // +3 / +3
      const out = computeCoupleScores(a, b);
      expect(metric(out, "polarization_loop").value).toBe(0);
      expect(dims(out)[0]).toMatchObject({ a_gap: 3, b_gap: 3, loop: false });
    });

    it("one side at 1 (or 0) is not a loop", () => {
      const [a, b] = partners({ a: { polarization: pol(2, 5) }, b: { polarization: pol(4, 3) } }); // +3 / -1
      expect(metric(computeCoupleScores(a, b), "polarization_loop").value).toBe(0);
      const [a0, b0] = partners({ a: { polarization: pol(2, 5) } }); // +3 / 0
      expect(metric(computeCoupleScores(a0, b0), "polarization_loop").value).toBe(0);
    });
  });

  describe("mental-health instruments never reach couple scores", () => {
    it("phq9 with item 9 = 3 in both partners, plus gad7 and oci_r, are absent from the output", () => {
      const input = completeCouple({
        include: ["oci_r"],
        a: { phq9: constantResponses("phq9", 3), gad7: constantResponses("gad7", 3), oci_r: constantResponses("oci_r", 4) },
        b: { phq9: setItem(benignResponses("phq9"), "phq9_9", 3), gad7: constantResponses("gad7", 3), oci_r: constantResponses("oci_r", 4) },
      });
      const a = { responses: input.a, scores: scoreAll(input.a) };
      const b = { responses: input.b, scores: scoreAll(input.b) };
      expect(a.scores.some((s) => s.instrument_key === "phq9" && s.value === 27)).toBe(true); // the input really carries them
      const out = computeCoupleScores(a, b);
      const json = JSON.stringify(out);
      expect(json).not.toContain("phq9");
      expect(json).not.toContain("gad7");
      expect(json).not.toContain("oci_r");
      expect(json).not.toContain("safety");
      // and the output is identical to the same couple with no mental-health data at all
      const stripped = (p: PartnerData): PartnerData => ({
        responses: Object.fromEntries(Object.entries(p.responses).filter(([k]) => !["phq9", "gad7", "oci_r"].includes(k))),
        scores: p.scores.filter((s) => !["phq9", "gad7", "oci_r"].includes(s.instrument_key)),
      });
      expect(out).toEqual(computeCoupleScores(stripped(a), stripped(b)));
    });

    it("partners carrying only mental-health data produce no couple scores at all", () => {
      const only = (): PartnerData => {
        const responses = { phq9: constantResponses("phq9", 3), gad7: constantResponses("gad7", 3), oci_r: constantResponses("oci_r", 4) };
        return { responses, scores: scoreAll(responses) };
      };
      expect(computeCoupleScores(only(), only())).toEqual([]);
    });
  });

  it("skips a metric when either partner lacks the instrument", () => {
    const input = completeCouple();
    const a = { responses: input.a, scores: scoreAll(input.a) };
    const withoutMap = Object.fromEntries(Object.entries(input.b).filter(([k]) => k !== "map"));
    const b = { responses: withoutMap, scores: scoreAll(withoutMap) };
    const out = computeCoupleScores(a, b);
    expect(out.find((c) => c.metric === "map_high_intensity_low_efficacy")).toBeUndefined();
    expect(out.find((c) => c.metric === "wdw_now_disagreement")).toBeDefined();
    // a fully-specified thresholds object is honoured
    const strict = computeCoupleScores(a, b, { ...DEFAULT_COUPLE_THRESHOLDS, wdw_now_disagreement_at_or_above: 0 });
    expect(metric(strict, "wdw_now_disagreement").value).toBe(24);
    void fullResponses;
  });
});
