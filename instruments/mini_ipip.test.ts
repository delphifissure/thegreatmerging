/**
 * Mini-IPIP (Donnellan et al. 2006): five 4-item subscales, mean_reverse_aware on a 1–5 scale.
 * Per config/instruments/mini_ipip.json the reverse items are 6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20:
 *   extraversion          1, 6R, 11, 16R
 *   agreeableness         2, 7R, 12, 17R
 *   conscientiousness     3, 8R, 13, 18R
 *   neuroticism           4, 9R, 14, 19R
 *   intellect_imagination 5, 10R, 15R, 20R
 * Reverse scoring is min + max - value = 6 - value.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/mini_ipip";
import { constantResponses, fullResponses, scoreMap, setItem, setItems, withoutItem } from "@/tests/unit/helpers/responses";

const SUBSCALES = ["extraversion", "agreeableness", "conscientiousness", "neuroticism", "intellect_imagination"];

describe("mini_ipip", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.key).toBe("mini_ipip");
    expect(definition.items).toHaveLength(20);
    expect(definition.items.filter((i) => i.reverse_scored).map((i) => i.item_id)).toEqual(
      [6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20].map((n) => `mini_ipip_${n}`),
    );
    expect(definition.scoring.subscales.map((s) => s.name)).toEqual(SUBSCALES);
    for (const s of definition.scoring.subscales) expect(s.method).toBe("mean_reverse_aware");
    expect(definition.scoring.cutoffs).toEqual([]);
  });

  it("(a) max: 5 on keyed items and 1 on reverse items gives mean 5 on every subscale", () => {
    const rs = fullResponses("mini_ipip", (item, _pass, scale) => (item.reverse_scored ? scale.min : scale.max));
    const m = scoreMap(score(rs));
    for (const name of SUBSCALES) {
      expect(m[name].value).toBe(5);
      expect(m[name].cutoff_label).toBeNull();
      expect(m[name].instrument_key).toBe("mini_ipip");
      expect(m[name].scoring_version).toBe("1.0.0");
      expect(m[name].unvalidated).toBeUndefined();
    }
  });

  it("(a') raw 5 on every item is not the max because reverse items score 6 - 5 = 1", () => {
    // extraversion (5 + 1 + 5 + 1) / 4 = 3, same for agreeableness, conscientiousness, neuroticism;
    // intellect_imagination has three reverse items: (5 + 1 + 1 + 1) / 4 = 2.
    const m = scoreMap(score(constantResponses("mini_ipip", 5)));
    expect(m.extraversion.value).toBe(3);
    expect(m.agreeableness.value).toBe(3);
    expect(m.conscientiousness.value).toBe(3);
    expect(m.neuroticism.value).toBe(3);
    expect(m.intellect_imagination.value).toBe(2);
  });

  it("(b) min: 1 on keyed items and 5 on reverse items gives mean 1 on every subscale", () => {
    const rs = fullResponses("mini_ipip", (item, _pass, scale) => (item.reverse_scored ? scale.max : scale.min));
    const m = scoreMap(score(rs));
    for (const name of SUBSCALES) expect(m[name].value).toBe(1);
  });

  it("(c) hand-worked mean with reverse items", () => {
    // extraversion: item 1 = 4, item 6 = 2 (reverse -> 6 - 2 = 4), item 11 = 5, item 16 = 1 (reverse -> 5)
    //   (4 + 4 + 5 + 5) / 4 = 4.5
    // every other item 3, and 6 - 3 = 3, so the other four subscales are exactly 3.
    const rs = setItems(constantResponses("mini_ipip", 3), [
      ["mini_ipip_1", 4],
      ["mini_ipip_6", 2],
      ["mini_ipip_11", 5],
      ["mini_ipip_16", 1],
    ]);
    const m = scoreMap(score(rs));
    expect(m.extraversion.value).toBe(4.5);
    expect(m.agreeableness.value).toBe(3);
    expect(m.conscientiousness.value).toBe(3);
    expect(m.neuroticism.value).toBe(3);
    expect(m.intellect_imagination.value).toBe(3);
  });

  it("(d) raising a reverse item lowers its subscale; raising a keyed item raises it", () => {
    const base = constantResponses("mini_ipip", 3);
    expect(scoreMap(score(base)).extraversion.value).toBe(3);
    // item 6 (reverse) 3 -> 5 scores 1: (3 + 1 + 3 + 3) / 4 = 2.5
    expect(scoreMap(score(setItem(base, "mini_ipip_6", 5))).extraversion.value).toBe(2.5);
    // item 1 (keyed) 3 -> 5: (5 + 3 + 3 + 3) / 4 = 3.5
    expect(scoreMap(score(setItem(base, "mini_ipip_1", 5))).extraversion.value).toBe(3.5);
    // other subscales untouched
    expect(scoreMap(score(setItem(base, "mini_ipip_6", 5))).agreeableness.value).toBe(3);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("mini_ipip", 3);
    const partial = withoutItem(base, "mini_ipip_20");
    expect(() => score(partial)).toThrow(IncompleteResponsesError);
    try {
      score(partial);
    } catch (e) {
      expect(e).toBeInstanceOf(IncompleteResponsesError);
      expect((e as IncompleteResponsesError).missing).toEqual([{ item_id: "mini_ipip_20", pass: "single" }]);
    }
    expect(() => score(setItem(base, "mini_ipip_1", 6))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "mini_ipip_1", 0))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "mini_ipip_1", 2.5))).toThrow(InvalidResponseError);
    expect(() => score([...base, { item_id: "mini_ipip_99", value: 3 }])).toThrow(InvalidResponseError);
    expect(() => score([{ ...base[0], pass: "nope" }, ...base.slice(1)])).toThrow(InvalidResponseError);
  });
});
