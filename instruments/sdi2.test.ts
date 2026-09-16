/**
 * SDI-2 (Spector, Carey & Steinberg 1996). Per config/instruments/sdi2.json:
 *   dyadic   = items 1–8   (items 1, 2 are 0–7; items 3–8 are 0–8)        -> max 7+7+6*8 = 62
 *   solitary = items 10–13 (item 10 is 0–7; items 11–13 are 0–8)          -> max 7+3*8 = 31
 *   total    = items 1–8 and 10–13                                          -> max 93
 *   items 9 and 14 are not in any subscale but are still required for completeness.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/sdi2";
import { maxResponses, minResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const DYADIC = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `sdi2_${n}`);
const SOLITARY = [10, 11, 12, 13].map((n) => `sdi2_${n}`);

describe("sdi2", () => {
  it("definition matches the published key", () => {
    expect(definition.items).toHaveLength(14);
    const max = (id: string) => definition.items.find((i) => i.item_id === id)!.scale.max;
    expect(["sdi2_1", "sdi2_2", "sdi2_10", "sdi2_14"].map(max)).toEqual([7, 7, 7, 7]);
    expect(["sdi2_3", "sdi2_4", "sdi2_5", "sdi2_6", "sdi2_7", "sdi2_8", "sdi2_9", "sdi2_11", "sdi2_12", "sdi2_13"].map(max)).toEqual(Array(10).fill(8));
    expect(definition.scoring.subscales).toEqual([
      { name: "dyadic", method: "sum", items: DYADIC },
      { name: "solitary", method: "sum", items: SOLITARY },
      { name: "total", method: "sum", items: [...DYADIC, ...SOLITARY] },
    ]);
    expect(definition.items.every((i) => !i.reverse_scored)).toBe(true);
    expect(definition.scoring.cutoffs).toEqual([]);
  });

  it("(a)/(c) max: dyadic 62, solitary 31, total 93", () => {
    const m = scoreMap(score(maxResponses("sdi2")));
    expect(m.dyadic.value).toBe(62);
    expect(m.solitary.value).toBe(31);
    expect(m.total.value).toBe(93);
    for (const s of Object.values(m)) expect(s.cutoff_label).toBeNull();
  });

  it("(b) min: 0 everywhere", () => {
    const m = scoreMap(score(minResponses("sdi2")));
    expect(m.dyadic.value).toBe(0);
    expect(m.solitary.value).toBe(0);
    expect(m.total.value).toBe(0);
  });

  it("(c') hand-worked mixed values", () => {
    // dyadic: 3 + 5 + 8 + 0 + 4 + 4 + 2 + 6 = 32; solitary: 7 + 0 + 8 + 1 = 16; total 48; items 9 and 14 ignored
    const rs = responsesFrom("sdi2", {
      sdi2_1: 3, sdi2_2: 5, sdi2_3: 8, sdi2_4: 0, sdi2_5: 4, sdi2_6: 4, sdi2_7: 2, sdi2_8: 6, sdi2_9: 8,
      sdi2_10: 7, sdi2_11: 0, sdi2_12: 8, sdi2_13: 1, sdi2_14: 5,
    });
    const m = scoreMap(score(rs));
    expect(m.dyadic.value).toBe(32);
    expect(m.solitary.value).toBe(16);
    expect(m.total.value).toBe(48);
  });

  it("items 9 and 14 are required for completeness but change no score", () => {
    const base = maxResponses("sdi2");
    for (const id of ["sdi2_9", "sdi2_14"]) {
      const lowered = scoreMap(score(setItem(base, id, 0)));
      expect(lowered.dyadic.value).toBe(62);
      expect(lowered.solitary.value).toBe(31);
      expect(lowered.total.value).toBe(93);
      expect(() => score(withoutItem(base, id))).toThrow(IncompleteResponsesError);
    }
  });

  it("(d) no reverse items: raising a dyadic item raises dyadic and total only; a solitary item raises solitary and total", () => {
    const base = minResponses("sdi2");
    const d = scoreMap(score(setItem(base, "sdi2_3", 5)));
    expect(d.dyadic.value).toBe(5);
    expect(d.solitary.value).toBe(0);
    expect(d.total.value).toBe(5);
    const s = scoreMap(score(setItem(base, "sdi2_11", 6)));
    expect(s.dyadic.value).toBe(0);
    expect(s.solitary.value).toBe(6);
    expect(s.total.value).toBe(6);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError on per-item ranges", () => {
    const base = minResponses("sdi2");
    expect(() => score(withoutItem(base, "sdi2_1"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "sdi2_1", 8))).toThrow(InvalidResponseError); // 0–7 item
    expect(() => score(setItem(base, "sdi2_3", 8))).not.toThrow(); // 0–8 item
    expect(() => score(setItem(base, "sdi2_3", 9))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "sdi2_10", 8))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "sdi2_14", 8))).toThrow(InvalidResponseError);
  });
});
