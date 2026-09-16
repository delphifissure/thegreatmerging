/**
 * ECR-R (Fraley, Waller & Brennan 2000): anxiety = mean of items 1–18, avoidance = mean of items 19–36,
 * 1–7 scale, mean_reverse_aware. Reverse items per config/instruments/ecr_r.json:
 *   anxiety:   9, 11                                         (2 of 18)
 *   avoidance: 20, 22, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36 (12 of 18)
 * Reverse scoring is 1 + 7 - value = 8 - value. Cutoffs (configurable defaults, not published norms):
 *   below 2.5 -> low, 2.5..4.5 inclusive -> moderate, above 4.5 -> high.
 */
import { describe, expect, it } from "vitest";
import { cutoffLabel, IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/ecr_r";
import type { Response } from "@/instruments/schema";
import { constantResponses, fullResponses, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const ANXIETY = Array.from({ length: 18 }, (_, i) => `ecr_r_${i + 1}`);
const AVOIDANCE = Array.from({ length: 18 }, (_, i) => `ecr_r_${i + 19}`);
const REVERSE = new Set([9, 11, 20, 22, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36].map((n) => `ecr_r_${n}`));

/** Set raw values so that the listed items SCORE the given values (raw = 8 - scored on reverse items). */
function withScored(base: Response[], itemIds: string[], scored: number[]): Response[] {
  return itemIds.reduce((rs, id, i) => setItem(rs, id, REVERSE.has(id) ? 8 - scored[i] : scored[i]), base);
}

describe("ecr_r", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.items).toHaveLength(36);
    expect(definition.items.filter((i) => i.reverse_scored).map((i) => i.item_id)).toEqual([...REVERSE]);
    const subs = scoreMap(score(constantResponses("ecr_r", 4)));
    expect(Object.keys(subs)).toEqual(["anxiety", "avoidance"]);
    expect(definition.scoring.subscales.find((s) => s.name === "anxiety")?.items).toEqual(ANXIETY);
    expect(definition.scoring.subscales.find((s) => s.name === "avoidance")?.items).toEqual(AVOIDANCE);
  });

  it("(a) max: 7 on keyed items and 1 on reverse items gives mean 7 -> high on both subscales", () => {
    const rs = fullResponses("ecr_r", (item, _pass, scale) => (item.reverse_scored ? scale.min : scale.max));
    const m = scoreMap(score(rs));
    expect(m.anxiety.value).toBe(7);
    expect(m.anxiety.cutoff_label).toBe("high");
    expect(m.avoidance.value).toBe(7);
    expect(m.avoidance.cutoff_label).toBe("high");
  });

  it("(a') raw 7 everywhere: anxiety (16*7 + 2*1)/18 = 114/18, avoidance (6*7 + 12*1)/18 = 3", () => {
    const m = scoreMap(score(constantResponses("ecr_r", 7)));
    expect(m.anxiety.value).toBe(114 / 18);
    expect(m.anxiety.cutoff_label).toBe("high");
    expect(m.avoidance.value).toBe(3);
    expect(m.avoidance.cutoff_label).toBe("moderate");
  });

  it("(b) min: 1 on keyed items and 7 on reverse items gives mean 1 -> low", () => {
    const rs = fullResponses("ecr_r", (item, _pass, scale) => (item.reverse_scored ? scale.max : scale.min));
    const m = scoreMap(score(rs));
    expect(m.anxiety.value).toBe(1);
    expect(m.anxiety.cutoff_label).toBe("low");
    expect(m.avoidance.value).toBe(1);
    expect(m.avoidance.cutoff_label).toBe("low");
  });

  it("(c) cutoff bands: 2.5 and 4.5 are moderate (inclusive), below 2.5 low, above 4.5 high", () => {
    const base = constantResponses("ecr_r", 4);
    // 18 items: mean 2.5 needs sum 45 = 9*2 + 9*3
    const m25 = scoreMap(score(withScored(base, ANXIETY, [...Array(9).fill(2), ...Array(9).fill(3)])));
    expect(m25.anxiety.value).toBe(2.5);
    expect(m25.anxiety.cutoff_label).toBe("moderate");
    // sum 43 = 11*2 + 7*3 -> 43/18 = 2.389 (a mean of exactly 2.4 is not reachable with 18 integer items)
    const m24 = scoreMap(score(withScored(base, ANXIETY, [...Array(11).fill(2), ...Array(7).fill(3)])));
    expect(m24.anxiety.value).toBe(43 / 18);
    expect(m24.anxiety.cutoff_label).toBe("low");
    // mean 4.5 needs sum 81 = 9*4 + 9*5
    const m45 = scoreMap(score(withScored(base, AVOIDANCE, [...Array(9).fill(4), ...Array(9).fill(5)])));
    expect(m45.avoidance.value).toBe(4.5);
    expect(m45.avoidance.cutoff_label).toBe("moderate");
    // sum 83 = 7*4 + 11*5 -> 83/18 = 4.611 (4.6 exactly is not reachable)
    const m46 = scoreMap(score(withScored(base, AVOIDANCE, [...Array(7).fill(4), ...Array(11).fill(5)])));
    expect(m46.avoidance.value).toBe(83 / 18);
    expect(m46.avoidance.cutoff_label).toBe("high");
    // the band function itself at the nominal values from the scoring documentation
    for (const sub of ["anxiety", "avoidance"]) {
      expect(cutoffLabel(definition.scoring.cutoffs, sub, 2.4)).toBe("low");
      expect(cutoffLabel(definition.scoring.cutoffs, sub, 2.5)).toBe("moderate");
      expect(cutoffLabel(definition.scoring.cutoffs, sub, 4.5)).toBe("moderate");
      expect(cutoffLabel(definition.scoring.cutoffs, sub, 4.6)).toBe("high");
    }
  });

  it("(d) raising a reverse item lowers its subscale; raising a keyed item raises it", () => {
    const base = constantResponses("ecr_r", 4); // every item scores 4 (8 - 4 = 4 on reverse items)
    expect(scoreMap(score(base)).anxiety.value).toBe(4);
    // ecr_r_9 (reverse, anxiety) 4 -> 7 scores 1: (17*4 + 1)/18 = 69/18
    const down = scoreMap(score(setItem(base, "ecr_r_9", 7)));
    expect(down.anxiety.value).toBe(69 / 18);
    expect(down.avoidance.value).toBe(4);
    // ecr_r_1 (keyed, anxiety) 4 -> 7: (17*4 + 7)/18 = 75/18
    expect(scoreMap(score(setItem(base, "ecr_r_1", 7))).anxiety.value).toBe(75 / 18);
    // ecr_r_36 (reverse, avoidance) 4 -> 1 scores 7: (17*4 + 7)/18 = 75/18
    expect(scoreMap(score(setItem(base, "ecr_r_36", 1))).avoidance.value).toBe(75 / 18);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("ecr_r", 4);
    expect(() => score(withoutItem(base, "ecr_r_36"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "ecr_r_1", 8))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "ecr_r_1", 0))).toThrow(InvalidResponseError);
  });
});
