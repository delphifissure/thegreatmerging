/**
 * runStage1 / computeFlags against config/flag_rules.json (version 1.0.0).
 * Each rule gets one test that plants exactly its trigger into completeCouple() and asserts the projected
 * flags exactly, and one just-below-threshold case producing no flag. Domains come from item.domain, else
 * the instrument's default_domain, except brief_crs and psdq which route to the rule's fixed domain.
 */
import { describe, expect, it } from "vitest";
import flagRules from "@/config/flag_rules.json";
import type { Flag } from "@/lib/interpretation/stage1";
import { computeDistressContext, MissingInstrumentsError, runStage1, summarizeDomains } from "@/lib/interpretation/stage1";
import { benignResponses, completeCouple, constantResponses, responsesFrom, setItem, setItems, withoutItem } from "@/tests/unit/helpers/responses";

type Projected = { rule_key: string; domain: string; user?: string; item?: string; weight: number; label?: string };
const proj = (f: Flag): Projected => ({
  rule_key: f.rule_key,
  domain: f.domain,
  weight: f.weight,
  ...(f.triggered_by.user ? { user: f.triggered_by.user } : {}),
  ...(f.triggered_by.item ? { item: f.triggered_by.item } : {}),
  ...(f.label ? { label: f.label } : {}),
});
const flagsOf = (input: ReturnType<typeof completeCouple>) => runStage1(input).flags.map(proj);

describe("runStage1", () => {
  it("the benign couple produces zero flags, no domains and distress_context false", () => {
    const out = runStage1(completeCouple());
    expect(out.flags).toEqual([]);
    expect(out.domains).toEqual([]);
    expect(out.distress_context).toBe(false);
    expect(out.rules_version).toBe(flagRules.version);
    expect(out.scores.a.some((s) => s.instrument_key === "phq9" && s.value === 0)).toBe(true);
    expect(JSON.stringify(out.couple_scores)).not.toMatch(/phq9|gad7|oci_r/);
  });

  describe("map_high_intensity_low_efficacy (weight 3, per area, per partner)", () => {
    it("fires at the inclusive boundary intensity 50 / efficacy 50, routed to the area's domain", () => {
      const input = completeCouple({ a: { map: (rs) => setItems(rs, [["map_1", 50, "intensity"], ["map_1", 50, "efficacy"]]) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "map_high_intensity_low_efficacy", domain: "household", user: "a", item: "map_1", weight: 3 }]);
      const out = runStage1(input);
      expect(out.flags[0].triggered_by).toEqual({ instrument: "map", item: "map_1", descriptor: "problem area: money", user: "a", values: { intensity: 50, efficacy: 50 } });
      expect(out.domains).toEqual([{ domain: "household", weight: 3, flag_count: 1 }]);
    });
    it("fires once per partner when both mark the same area (children -> parenting)", () => {
      const both = (rs: ReturnType<typeof benignResponses>) => setItems(rs, [["map_8", 90, "intensity"], ["map_8", 10, "efficacy"]]);
      expect(flagsOf(completeCouple({ a: { map: both }, b: { map: both } }))).toEqual([
        { rule_key: "map_high_intensity_low_efficacy", domain: "parenting", user: "a", item: "map_8", weight: 3 },
        { rule_key: "map_high_intensity_low_efficacy", domain: "parenting", user: "b", item: "map_8", weight: 3 },
      ]);
    });
    it("does not fire at intensity 49 or efficacy 51", () => {
      expect(flagsOf(completeCouple({ a: { map: (rs) => setItems(rs, [["map_1", 49, "intensity"], ["map_1", 50, "efficacy"]]) } }))).toEqual([]);
      expect(flagsOf(completeCouple({ b: { map: (rs) => setItems(rs, [["map_1", 50, "intensity"], ["map_1", 51, "efficacy"]]) } }))).toEqual([]);
    });
  });

  describe("acq_desired_change (weight 2)", () => {
    // b's partner_wants is set to the same value so no perceptual miss is created alongside.
    it("fires at |desired change| = 2 on the self pass, routed to the item's domain", () => {
      const input = completeCouple({
        a: { acq: (rs) => setItem(rs, "acq_6", 2, "self") },
        b: { acq: (rs) => setItem(rs, "acq_6", 2, "partner_wants") },
      });
      expect(flagsOf(input)).toEqual([{ rule_key: "acq_desired_change", domain: "intimacy", user: "a", item: "acq_6", weight: 2 }]);
      const negative = completeCouple({
        b: { acq: (rs) => setItem(rs, "acq_15", -3, "self") },
        a: { acq: (rs) => setItem(rs, "acq_15", -3, "partner_wants") },
      });
      expect(flagsOf(negative)).toEqual([{ rule_key: "acq_desired_change", domain: "conflict", user: "b", item: "acq_15", weight: 2 }]);
    });
    it("does not fire at |desired change| = 1, and the partner_wants pass never triggers it", () => {
      expect(flagsOf(completeCouple({ a: { acq: (rs) => setItem(rs, "acq_6", 1, "self") } }))).toEqual([]);
      expect(flagsOf(completeCouple({ a: { acq: (rs) => setItem(rs, "acq_6", -1, "self") } }))).toEqual([]);
    });
  });

  describe("acq_perceptual_miss (weight 2, attributed to the perceiver)", () => {
    it("fires when |perceived - actual| = 2 (a thinks b wants +2, b wants 0)", () => {
      const input = completeCouple({ a: { acq: (rs) => setItem(rs, "acq_8", 2, "partner_wants") } });
      expect(flagsOf(input)).toEqual([{ rule_key: "acq_perceptual_miss", domain: "communication", user: "a", item: "acq_8", weight: 2 }]);
      expect(runStage1(input).flags[0].triggered_by.values).toEqual({ perceived: 2, actual: 0, miss: 2 });
    });
    it("is attributed to b when b misperceives a", () => {
      const input = completeCouple({ b: { acq: (rs) => setItem(rs, "acq_10", -2, "partner_wants") } });
      expect(flagsOf(input)).toEqual([{ rule_key: "acq_perceptual_miss", domain: "parenting", user: "b", item: "acq_10", weight: 2 }]);
    });
    it("does not fire at a miss of 1", () => {
      expect(flagsOf(completeCouple({ a: { acq: (rs) => setItem(rs, "acq_8", 1, "partner_wants") } }))).toEqual([]);
    });
  });

  describe("fapbi_unacceptable (weight 2)", () => {
    it("fires at acceptability 4, routed to the behavior's domain", () => {
      const input = completeCouple({ a: { fapbi: (rs) => setItem(rs, "fapbi_1", 4, "acceptability") } });
      expect(flagsOf(input)).toEqual([{ rule_key: "fapbi_unacceptable", domain: "intimacy", user: "a", item: "fapbi_1", weight: 2 }]);
      expect(runStage1(input).flags[0].triggered_by.values).toEqual({ acceptability: 4, frequency: 5 });
      expect(flagsOf(completeCouple({ b: { fapbi: (rs) => setItem(rs, "fapbi_16", 0, "acceptability") } }))).toEqual([
        { rule_key: "fapbi_unacceptable", domain: "conflict", user: "b", item: "fapbi_16", weight: 2 },
      ]);
    });
    it("does not fire at acceptability 5, whatever the frequency", () => {
      expect(flagsOf(completeCouple({ a: { fapbi: (rs) => setItems(rs, [["fapbi_1", 5, "acceptability"], ["fapbi_1", 99, "frequency"]]) } }))).toEqual([]);
    });
  });

  describe("wdw_now_ideal_gap (weight 2)", () => {
    // b's "now" is mirrored (8 -> 2) so the disagreement rule stays silent; b's ideal matches b's now.
    it("fires at a now-versus-ideal gap of 3 for one person", () => {
      const input = completeCouple({
        a: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 2, "now"], ["who_does_what_1", 5, "ideal"]]) },
        b: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 8, "now"], ["who_does_what_1", 8, "ideal"]]) },
      });
      expect(flagsOf(input)).toEqual([{ rule_key: "wdw_now_ideal_gap", domain: "household", user: "a", item: "who_does_what_1", weight: 2 }]);
      // childcare rows route to parenting
      const childcare = completeCouple({
        b: { who_does_what: (rs) => setItems(rs, [["who_does_what_21", 9, "now"], ["who_does_what_21", 5, "ideal"]]) },
        a: { who_does_what: (rs) => setItems(rs, [["who_does_what_21", 1, "now"], ["who_does_what_21", 1, "ideal"]]) },
      });
      expect(flagsOf(childcare)).toEqual([{ rule_key: "wdw_now_ideal_gap", domain: "parenting", user: "b", item: "who_does_what_21", weight: 2 }]);
    });
    it("does not fire at a gap of 2", () => {
      const input = completeCouple({
        a: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 3, "now"], ["who_does_what_1", 5, "ideal"]]) },
        b: { who_does_what: (rs) => setItems(rs, [["who_does_what_1", 7, "now"], ["who_does_what_1", 7, "ideal"]]) },
      });
      expect(flagsOf(input)).toEqual([]);
    });
  });

  describe("wdw_now_disagreement (weight 2, both)", () => {
    it("fires when the two mirrored 'now' ratings differ by 3", () => {
      // a now 5; b now 2 mirrors to 8 -> |5 - 8| = 3. Ideals equal nows so the gap rule stays silent.
      const input = completeCouple({ b: { who_does_what: (rs) => setItems(rs, [["who_does_what_3", 2, "now"], ["who_does_what_3", 2, "ideal"]]) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "wdw_now_disagreement", domain: "household", user: "both", item: "who_does_what_3", weight: 2 }]);
      expect(runStage1(input).flags[0].triggered_by.values).toEqual({ a_now: 5, b_now_mirrored: 8, disagreement: 3 });
    });
    it("does not fire at a mirrored difference of 2", () => {
      const input = completeCouple({ b: { who_does_what: (rs) => setItems(rs, [["who_does_what_3", 3, "now"], ["who_does_what_3", 3, "ideal"]]) } });
      expect(flagsOf(input)).toEqual([]);
    });
  });

  describe("rdas_consensus_disagree (weight 2)", () => {
    it("fires at a consensus item value of 2, routed to the item's domain", () => {
      const input = completeCouple({ a: { rdas: (rs) => setItem(rs, "rdas_2", 2) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "rdas_consensus_disagree", domain: "intimacy", user: "a", item: "rdas_2", weight: 2 }]);
      expect(flagsOf(completeCouple({ b: { rdas: (rs) => setItem(rs, "rdas_5", 0) } }))).toEqual([
        { rule_key: "rdas_consensus_disagree", domain: "social_family_longterm", user: "b", item: "rdas_5", weight: 2 },
      ]);
    });
    it("does not fire at 3, and satisfaction / cohesion items are not consensus items", () => {
      expect(flagsOf(completeCouple({ a: { rdas: (rs) => setItem(rs, "rdas_2", 3) } }))).toEqual([]);
      expect(flagsOf(completeCouple({ a: { rdas: (rs) => setItems(rs, [["rdas_7", 0], ["rdas_11", 0]]) } }))).toEqual([]);
    });
  });

  describe("brief_crs_negative_coparenting (weight 3, parenting)", () => {
    it("fires when undermining or exposure_to_conflict mean is above 3 (no item)", () => {
      const input = completeCouple({ a: { brief_crs: (rs) => setItems(rs, [["brief_crs_9", 4], ["brief_crs_10", 4]]) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "brief_crs_negative_coparenting", domain: "parenting", user: "a", weight: 3 }]);
      expect(runStage1(input).flags[0].triggered_by).toEqual({ instrument: "brief_crs", user: "a", values: { subscale: "undermining", value: 4 } });
      // exposure (6 + 1) / 2 = 3.5 for b -> one flag for b
      expect(flagsOf(completeCouple({ b: { brief_crs: (rs) => setItems(rs, [["brief_crs_5", 6], ["brief_crs_6", 1]]) } }))).toEqual([
        { rule_key: "brief_crs_negative_coparenting", domain: "parenting", user: "b", weight: 3 },
      ]);
    });
    it("does not fire at a mean of exactly 3", () => {
      expect(flagsOf(completeCouple({ a: { brief_crs: (rs) => setItems(rs, [["brief_crs_9", 3], ["brief_crs_10", 3]]) } }))).toEqual([]);
      expect(flagsOf(completeCouple({ a: { brief_crs: (rs) => setItems(rs, [["brief_crs_5", 4], ["brief_crs_6", 2]]) } }))).toEqual([]);
    });
  });

  describe("psdq_between_parent_gap (weight 3, parenting, label values_conflict, both)", () => {
    const permissive = ["psdq_sf_4", "psdq_sf_8", "psdq_sf_15", "psdq_sf_20", "psdq_sf_24"];
    const authoritative = [1, 3, 5, 7, 9, 11, 12, 14, 18, 21, 22, 25, 27, 29, 31].map((n) => `psdq_sf_${n}`);
    it("fires at a permissive gap of exactly 1.0", () => {
      const input = completeCouple({ a: { psdq_sf: (rs) => setItems(rs, permissive.map((id): [string, number] => [id, 4])) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "psdq_between_parent_gap", domain: "parenting", user: "both", weight: 3, label: "values_conflict" }]);
      expect(runStage1(input).flags[0].triggered_by).toEqual({ instrument: "psdq_sf", user: "both", values: { style: "permissive", a: 4, b: 3, gap: 1 } });
    });
    it("does not fire at a gap of 0.8, and ignores the authoritative style entirely", () => {
      const point8 = completeCouple({ a: { psdq_sf: (rs) => setItems(rs, permissive.slice(0, 4).map((id): [string, number] => [id, 4])) } }); // (4*4 + 3)/5 = 3.8
      expect(flagsOf(point8)).toEqual([]);
      const authoritativeOnly = completeCouple({ a: { psdq_sf: (rs) => setItems(rs, authoritative.map((id): [string, number] => [id, 5])) } }); // gap 2 on authoritative
      expect(flagsOf(authoritativeOnly)).toEqual([]);
    });
  });

  describe("polarization_loop (weight 2, label shared_pattern, both, unvalidated)", () => {
    const pol = (alone: number, withPartner: number, item = "polarization_1") => (rs: ReturnType<typeof benignResponses>) =>
      setItems(rs, [[item, alone, "self_alone"], [item, withPartner, "self_with_partner"]]);
    it("fires on opposite-sign gaps of 2 and 2, routed to the dimension's domain", () => {
      const input = completeCouple({ a: { polarization: pol(2, 4) }, b: { polarization: pol(5, 3) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "polarization_loop", domain: "parenting", user: "both", item: "polarization_1", weight: 2, label: "shared_pattern" }]);
      const flag = runStage1(input).flags[0];
      expect(flag.triggered_by).toEqual({ instrument: "polarization", item: "polarization_1", descriptor: "structure with a child", user: "both", values: { a_gap: 2, b_gap: -2 }, unvalidated: true });
    });
    it("does not fire when one gap is 1 or when both gaps share a sign", () => {
      expect(flagsOf(completeCouple({ a: { polarization: pol(2, 4) }, b: { polarization: pol(4, 3) } }))).toEqual([]);
      expect(flagsOf(completeCouple({ a: { polarization: pol(2, 6) }, b: { polarization: pol(1, 5) } }))).toEqual([]);
    });
  });

  describe("needs_context (weight 1, label context)", () => {
    it("routes a marked rdas_2 to intimacy as a weight-1 context flag", () => {
      const input = completeCouple({ a: { rdas: (rs) => setItem(rs, "rdas_2", { needs_context: true }) } });
      expect(flagsOf(input)).toEqual([{ rule_key: "needs_context", domain: "intimacy", user: "a", item: "rdas_2", weight: 1, label: "context" }]);
      expect(runStage1(input).flags[0].triggered_by).toEqual({ instrument: "rdas", item: "rdas_2", descriptor: "consensus item 2", user: "a", values: { value: 5 } });
    });
    it("carries the pass and the unvalidated tag for a polarization item", () => {
      const input = completeCouple({ b: { polarization: (rs) => setItem(rs, "polarization_5", { needs_context: true }, "partner_becomes") } });
      expect(flagsOf(input)).toEqual([{ rule_key: "needs_context", domain: "intimacy", user: "b", item: "polarization_5", weight: 1, label: "context" }]);
      expect(runStage1(input).flags[0].triggered_by).toMatchObject({ values: { value: 4, pass: "partner_becomes" }, unvalidated: true });
    });
    it("produces NO flag on a mental-health instrument", () => {
      const input = completeCouple({
        include: ["oci_r"],
        a: {
          phq9: setItem(benignResponses("phq9"), "phq9_9", { value: 2, needs_context: true }),
          gad7: setItem(benignResponses("gad7"), "gad7_1", { needs_context: true }),
          oci_r: setItem(benignResponses("oci_r"), "oci_r_1", { needs_context: true }),
        },
      });
      expect(flagsOf(input)).toEqual([]);
    });
    it("does not fire when needs_context is false or absent", () => {
      expect(flagsOf(completeCouple({ a: { rdas: (rs) => setItem(rs, "rdas_2", { needs_context: false }) } }))).toEqual([]);
    });
  });

  describe("domains", () => {
    it("are ordered by summed weight, descending", () => {
      // intimacy: rdas_2 disagree (2) + fapbi_1 (2) = 4; parenting: brief_crs undermining (3) = 3; household: needs_context on who_does_what_1 (1)
      const input = completeCouple({
        a: {
          rdas: (rs) => setItem(rs, "rdas_2", 2),
          fapbi: (rs) => setItem(rs, "fapbi_1", 4, "acceptability"),
          brief_crs: (rs) => setItems(rs, [["brief_crs_9", 5], ["brief_crs_10", 5]]),
          who_does_what: (rs) => setItem(rs, "who_does_what_1", { needs_context: true }, "now"),
        },
      });
      expect(runStage1(input).domains).toEqual([
        { domain: "intimacy", weight: 4, flag_count: 2 },
        { domain: "parenting", weight: 3, flag_count: 1 },
        { domain: "household", weight: 1, flag_count: 1 },
      ]);
    });
    it("break ties in the canonical DOMAINS order", () => {
      const input = completeCouple({
        a: { fapbi: (rs) => setItem(rs, "fapbi_1", 4, "acceptability") }, // intimacy 2
        b: { who_does_what: (rs) => setItems(rs, [["who_does_what_2", 2, "now"], ["who_does_what_2", 5, "ideal"]]) }, // household 2, plus...
      });
      // ...b now 2 mirrors to 8 vs a 5 -> disagreement 3 -> household 2 more = 4. Make a mirror it instead:
      input.a.who_does_what = setItems(input.a.who_does_what, [["who_does_what_2", 8, "now"], ["who_does_what_2", 8, "ideal"]]);
      // a's own gap is 0 and disagreement |8 - 8| = 0, so household = 2 and intimacy = 2: tie -> intimacy first
      expect(runStage1(input).domains).toEqual([
        { domain: "intimacy", weight: 2, flag_count: 1 },
        { domain: "household", weight: 2, flag_count: 1 },
      ]);
      expect(summarizeDomains([])).toEqual([]);
    });
  });

  describe("distress_context", () => {
    const phq = (total: number) => responsesFrom("phq9", Object.fromEntries(Array.from({ length: Math.ceil(total / 3) }, (_, i) => [`phq9_${i + 1}`, Math.min(3, total - 3 * i)])), 0);
    const gad = (total: number) => responsesFrom("gad7", Object.fromEntries(Array.from({ length: Math.ceil(total / 3) }, (_, i) => [`gad7_${i + 1}`, Math.min(3, total - 3 * i)])), 0);
    it("is true when a's PHQ-9 total is 10 and false at 9", () => {
      expect(runStage1(completeCouple({ a: { phq9: phq(10) } })).distress_context).toBe(true);
      expect(runStage1(completeCouple({ a: { phq9: phq(9) } })).distress_context).toBe(false);
      expect(runStage1(completeCouple({ b: { phq9: phq(27) } })).distress_context).toBe(true);
    });
    it("is true when b's GAD-7 total is 10 and false at 9", () => {
      expect(runStage1(completeCouple({ b: { gad7: gad(10) } })).distress_context).toBe(true);
      expect(runStage1(completeCouple({ b: { gad7: gad(9) } })).distress_context).toBe(false);
      expect(runStage1(completeCouple({ a: { gad7: gad(21) } })).distress_context).toBe(true);
    });
    it("distress adds no flags and is computed from totals only", () => {
      const out = runStage1(completeCouple({ a: { phq9: constantResponses("phq9", 3) } }));
      expect(out.flags).toEqual([]);
      expect(out.distress_context).toBe(true);
      expect(computeDistressContext([], [])).toBe(false);
      expect(computeDistressContext([{ instrument_key: "phq9", subscale: "total", value: 10, cutoff_label: "moderate", scoring_version: "1.0.0" }], [])).toBe(true);
      expect(computeDistressContext([], [{ instrument_key: "gad7", subscale: "total", value: 9, cutoff_label: "mild", scoring_version: "1.0.0" }])).toBe(false);
    });
  });

  describe("completeness", () => {
    it("throws MissingInstrumentsError when a required instrument is missing", () => {
      const input = completeCouple();
      delete input.a.map;
      expect(() => runStage1(input)).toThrow(MissingInstrumentsError);
      try {
        runStage1(input);
      } catch (e) {
        expect((e as MissingInstrumentsError).missing).toEqual([{ user: "a", instrument: "map" }]);
      }
    });
    it("throws when a required instrument is incomplete", () => {
      const input = completeCouple({ b: { csi16: (rs) => withoutItem(rs, "csi16_16") } });
      expect(() => runStage1(input)).toThrow(MissingInstrumentsError);
      try {
        runStage1(input);
      } catch (e) {
        expect((e as MissingInstrumentsError).missing).toEqual([{ user: "b", instrument: "csi16" }]);
      }
    });
    it("brief_crs and psdq_sf are required only when the couple has children", () => {
      const noKids = completeCouple({ hasChildren: false });
      expect(noKids.a.brief_crs).toBeUndefined();
      expect(noKids.a.psdq_sf).toBeUndefined();
      expect(runStage1(noKids).flags).toEqual([]);
      const kidsButNoParentingInstruments = { ...noKids, hasChildren: true };
      expect(() => runStage1(kidsButNoParentingInstruments)).toThrow(MissingInstrumentsError);
      try {
        runStage1(kidsButNoParentingInstruments);
      } catch (e) {
        expect((e as MissingInstrumentsError).missing).toEqual([
          { user: "a", instrument: "brief_crs" },
          { user: "a", instrument: "psdq_sf" },
          { user: "b", instrument: "brief_crs" },
          { user: "b", instrument: "psdq_sf" },
        ]);
      }
    });
    it("optional instruments (oci_r, prqc) are scored when present and never required", () => {
      const out = runStage1(completeCouple({ include: ["oci_r", "prqc"] }));
      expect(out.scores.a.some((s) => s.instrument_key === "prqc")).toBe(true);
      expect(out.scores.a.some((s) => s.instrument_key === "oci_r")).toBe(true);
      expect(out.flags).toEqual([]);
    });
  });
});
