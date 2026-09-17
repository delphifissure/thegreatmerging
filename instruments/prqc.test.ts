/**
 * PRQC (Fletcher, Simpson & Thomas 2000): 18 items 1–7, six 3-item mean subscales. Items are
 * administered interleaved, so component c (0-based, in the order below) holds items c+1, c+7, c+13
 * (form's scoring section, relationshipscienceonline.com):
 *   satisfaction 1, 7, 13 | commitment 2, 8, 14 | intimacy 3, 9, 15 | trust 4, 10, 16 | passion 5, 11, 17 | love 6, 12, 18
 * Optional instrument; no reverse scoring, no cutoffs.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/prqc";
import { maxResponses, minResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const SUBSCALES = ["satisfaction", "commitment", "intimacy", "trust", "passion", "love"];

describe("prqc", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.items).toHaveLength(18);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 1, max: 7 });
    expect(definition.items.every((i) => !i.reverse_scored)).toBe(true);
    expect(definition.scoring.subscales.map((s) => [s.name, s.method, s.items])).toEqual(
      SUBSCALES.map((name, i) => [name, "mean", [1, 7, 13].map((k) => `prqc_${i + k}`)]),
    );
  });

  it("(a) max: 7 everywhere -> every subscale mean 7", () => {
    const m = scoreMap(score(maxResponses("prqc")));
    for (const s of SUBSCALES) expect(m[s]).toMatchObject({ value: 7, cutoff_label: null });
  });

  it("(b) min: 1 everywhere -> every subscale mean 1", () => {
    const m = scoreMap(score(minResponses("prqc")));
    for (const s of SUBSCALES) expect(m[s].value).toBe(1);
  });

  it("(c) hand-worked: satisfaction [7,6,5] = 6; commitment [1,2,3] = 2; love [7,7,1] = 5", () => {
    const m = scoreMap(score(responsesFrom("prqc", { prqc_1: 7, prqc_7: 6, prqc_13: 5, prqc_2: 1, prqc_8: 2, prqc_14: 3, prqc_6: 7, prqc_12: 7, prqc_18: 1 }, 4)));
    expect(m.satisfaction.value).toBe(6);
    expect(m.commitment.value).toBe(2);
    expect(m.love.value).toBe(5);
    expect(m.trust.value).toBe(4);
  });

  it("(d) no reverse items: raising one trust item by 6 raises trust by 2 and nothing else", () => {
    const m = scoreMap(score(setItem(minResponses("prqc"), "prqc_10", 7)));
    expect(m.trust.value).toBe(3);
    for (const s of SUBSCALES.filter((x) => x !== "trust")) expect(m[s].value).toBe(1);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = minResponses("prqc");
    expect(() => score(withoutItem(base, "prqc_18"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "prqc_1", 8))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "prqc_1", 0))).toThrow(InvalidResponseError);
  });
});
