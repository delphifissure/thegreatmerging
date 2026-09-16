/**
 * Every synthetic couple fixture in evals/synthetic_couples/couples runs through the production
 * runStage1 and must reproduce its hand-derived expected block exactly.
 */
import { describe, expect, it } from "vitest";
import { actualDomains, compareToExpected, flagKey, loadSyntheticCouples, polarizationLoops, projectFlag, toStage1Input } from "@/evals/synthetic_couples/index";
import { runStage1 } from "@/lib/interpretation/stage1";

const couples = loadSyntheticCouples();

describe("synthetic couples", () => {
  it("there are 20 fixtures with unique, sequential ids", () => {
    expect(couples).toHaveLength(20);
    expect(couples.map((c) => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => `couple_${String(i + 1).padStart(2, "0")}`));
    for (const c of couples) expect(c.description.length).toBeGreaterThan(20);
  });

  it("the ten rules, a no-flag couple, a childless couple, both distress sources and a boundary couple are all covered", () => {
    const rules = new Set(couples.flatMap((c) => c.expected.flags.map((f) => f.rule_key)));
    for (const rule of [
      "map_high_intensity_low_efficacy", "acq_desired_change", "acq_perceptual_miss", "fapbi_unacceptable", "wdw_now_ideal_gap",
      "wdw_now_disagreement", "rdas_consensus_disagree", "brief_crs_negative_coparenting", "psdq_between_parent_gap", "polarization_loop", "needs_context",
    ]) expect(rules, rule).toContain(rule);
    expect(couples.filter((c) => c.expected.flags.length === 0 && !c.expected.distress_context).length).toBeGreaterThanOrEqual(2);
    expect(couples.some((c) => !c.has_children)).toBe(true);
    expect(couples.filter((c) => c.expected.distress_context).length).toBeGreaterThanOrEqual(2);
    expect(couples.some((c) => c.expected.polarization_loops.length === 3)).toBe(true);
  });

  for (const couple of couples) {
    it(`${couple.id}: ${couple.description}`, () => {
      const out = runStage1(toStage1Input(couple));
      expect(out.distress_context).toBe(couple.expected.distress_context);
      expect(actualDomains(out)).toEqual(couple.expected.domains);
      expect(out.flags.map(projectFlag).map(flagKey).sort()).toEqual(couple.expected.flags.map(flagKey).sort());
      expect(polarizationLoops(out)).toEqual([...couple.expected.polarization_loops].sort());
      expect(compareToExpected(couple, out)).toEqual([]);
      // fixtures never carry mental-health data into the couple layer
      expect(JSON.stringify(out.couple_scores)).not.toMatch(/phq9|gad7|oci_r/);
    });
  }

  it("compareToExpected reports each kind of difference", () => {
    const couple = couples.find((c) => c.id === "couple_02")!;
    const out = runStage1(toStage1Input(couple));
    const tampered = {
      ...couple,
      expected: {
        distress_context: true,
        domains: { household: 1, intimacy: 2 },
        flags: [{ rule_key: "rdas_consensus_disagree", domain: "intimacy", user: "a" as const, item: "rdas_2", weight: 2 }],
        polarization_loops: ["polarization_1"],
      },
    };
    const diffs = compareToExpected(tampered, out);
    expect(diffs).toEqual([
      "distress_context: expected true, got false",
      "domain household: expected weight 1, got 3",
      "domain intimacy: expected weight 2, got none",
      "flag missing (1x): rdas_consensus_disagree | intimacy | a | rdas_2 | - | 2",
      "flag unexpected (1x): map_high_intensity_low_efficacy | household | a | map_1 | - | 3",
      "polarization_loops: expected [polarization_1], got []",
    ]);
  });
});
