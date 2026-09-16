/**
 * Mini-IPIP (Donnellan et al. 2006; items, factors and keying verified from the IPIP key page,
 * see config notes): five 4-item subscales, mean_reverse_aware on a 1–5 scale. Items are in the
 * IPIP key page's order (grouped by factor):
 *   extraversion          1, 2, 3R, 4R
 *   agreeableness         5, 6, 7R, 8R
 *   conscientiousness     9, 10, 11R, 12R
 *   neuroticism           13, 14, 15R, 16R
 *   intellect_imagination 17, 18R, 19R, 20R
 * Reverse scoring is min + max - value = 6 - value.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/mini_ipip";
import { constantResponses, responsesFrom, scoreMap, withoutItem } from "@/tests/unit/helpers/responses";

const KEY: Record<string, number[]> = {
  extraversion: [1, 2, 3, 4],
  agreeableness: [5, 6, 7, 8],
  conscientiousness: [9, 10, 11, 12],
  neuroticism: [13, 14, 15, 16],
  intellect_imagination: [17, 18, 19, 20],
};
const REVERSE = [3, 4, 7, 8, 11, 12, 15, 16, 18, 19, 20];
const SUBSCALES = Object.keys(KEY);

describe("mini_ipip", () => {
  it("definition matches the verified key", () => {
    expect(definition.key).toBe("mini_ipip");
    expect(definition.items).toHaveLength(20);
    expect(definition.items.filter((i) => i.reverse_scored).map((i) => i.item_id)).toEqual(REVERSE.map((n) => `mini_ipip_${n}`));
    expect(definition.scoring.subscales.map((s) => s.name)).toEqual(SUBSCALES);
    for (const s of definition.scoring.subscales) {
      expect(s.method).toBe("mean_reverse_aware");
      expect(s.items).toEqual(KEY[s.name].map((n) => `mini_ipip_${n}`));
    }
    expect(definition.scoring.cutoffs).toEqual([]);
    expect(definition.scoring_key_verified).toBe(true);
    expect(definition.items.every((i) => i.text !== "TODO: populate from source")).toBe(true);
  });

  it("(a) max: 5 on keyed items and 1 on reverse items gives mean 5 on every subscale", () => {
    const values = Object.fromEntries(definition.items.map((i) => [i.item_id, i.reverse_scored ? 1 : 5]));
    const m = scoreMap(score(responsesFrom("mini_ipip", values)));
    for (const s of SUBSCALES) expect(m[s]).toMatchObject({ value: 5, cutoff_label: null });
  });

  it("(b) min: 1 on keyed items and 5 on reverse items gives mean 1 on every subscale", () => {
    const values = Object.fromEntries(definition.items.map((i) => [i.item_id, i.reverse_scored ? 5 : 1]));
    const m = scoreMap(score(responsesFrom("mini_ipip", values)));
    for (const s of SUBSCALES) expect(m[s].value).toBe(1);
  });

  it("(c) hand-worked means: 5 everywhere gives 3 on the four 2R factors and 2 on intellect (5 + 1 + 1 + 1) / 4", () => {
    const m = scoreMap(score(constantResponses("mini_ipip", 5)));
    for (const s of ["extraversion", "agreeableness", "conscientiousness", "neuroticism"]) expect(m[s].value).toBe(3);
    expect(m.intellect_imagination.value).toBe(2);
    // extraversion: 4, 2, 5 (reversed to 1), 3 (reversed to 3) -> (4 + 2 + 1 + 3) / 4 = 2.5
    const e = scoreMap(score(responsesFrom("mini_ipip", { mini_ipip_1: 4, mini_ipip_2: 2, mini_ipip_3: 5, mini_ipip_4: 3 }, 3)));
    expect(e.extraversion.value).toBe(2.5);
  });

  it("(d) raising a reverse item lowers its subscale; raising a keyed item raises it", () => {
    const base = scoreMap(score(constantResponses("mini_ipip", 3)));
    const rev = scoreMap(score(responsesFrom("mini_ipip", { mini_ipip_3: 5 }, 3)));
    expect(rev.extraversion.value).toBe(base.extraversion.value - 0.5);
    const fwd = scoreMap(score(responsesFrom("mini_ipip", { mini_ipip_1: 5 }, 3)));
    expect(fwd.extraversion.value).toBe(base.extraversion.value + 0.5);
    for (const s of SUBSCALES) if (s !== "extraversion") expect(fwd[s].value).toBe(base[s].value);
  });

  it("(e) incomplete and out-of-range sets are rejected", () => {
    expect(() => score(withoutItem(constantResponses("mini_ipip", 3), "mini_ipip_20"))).toThrow(IncompleteResponsesError);
    expect(() => score(responsesFrom("mini_ipip", { mini_ipip_1: 6 }, 3))).toThrow(InvalidResponseError);
  });
});
