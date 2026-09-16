/**
 * PRQC (Fletcher, Simpson & Thomas 2000): 18 items 1–7, six 3-item mean subscales per config:
 *   satisfaction 1–3 | commitment 4–6 | intimacy 7–9 | trust 10–12 | passion 13–15 | love 16–18
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
      SUBSCALES.map((name, i) => [name, "mean", [1, 2, 3].map((k) => `prqc_${3 * i + k}`)]),
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
    const m = scoreMap(score(responsesFrom("prqc", { prqc_1: 7, prqc_2: 6, prqc_3: 5, prqc_4: 1, prqc_5: 2, prqc_6: 3, prqc_16: 7, prqc_17: 7, prqc_18: 1 }, 4)));
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
