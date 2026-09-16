/**
 * PSDQ-SF (Robinson et al. 2001): 32 items 1–5, three style means per config:
 *   authoritative 15 items: 1, 3, 5, 7, 9, 11, 12, 14, 18, 21, 22, 25, 27, 29, 31
 *   authoritarian 12 items: 2, 6, 10, 13, 16, 17, 19, 23, 26, 28, 30, 32
 *   permissive     5 items: 4, 8, 15, 20, 24
 * No reverse scoring, no cutoffs. The between-parent gap flag is exercised in tests/unit/stage1.test.ts.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/psdq_sf";
import { constantResponses, maxResponses, minResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const AUTHORITATIVE = [1, 3, 5, 7, 9, 11, 12, 14, 18, 21, 22, 25, 27, 29, 31].map((n) => `psdq_sf_${n}`);
const AUTHORITARIAN = [2, 6, 10, 13, 16, 17, 19, 23, 26, 28, 30, 32].map((n) => `psdq_sf_${n}`);
const PERMISSIVE = [4, 8, 15, 20, 24].map((n) => `psdq_sf_${n}`);

describe("psdq_sf", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.items).toHaveLength(32);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 1, max: 5 });
    expect(definition.items.every((i) => !i.reverse_scored)).toBe(true);
    expect(definition.scoring.subscales).toEqual([
      { name: "authoritative", method: "mean", items: AUTHORITATIVE },
      { name: "authoritarian", method: "mean", items: AUTHORITARIAN },
      { name: "permissive", method: "mean", items: PERMISSIVE },
    ]);
    expect(definition.default_domain).toBe("parenting");
  });

  it("(a) max: 5 everywhere -> every style mean 5", () => {
    const m = scoreMap(score(maxResponses("psdq_sf")));
    expect(m.authoritative).toMatchObject({ value: 5, cutoff_label: null });
    expect(m.authoritarian.value).toBe(5);
    expect(m.permissive.value).toBe(5);
  });

  it("(b) min: 1 everywhere -> every style mean 1", () => {
    const m = scoreMap(score(minResponses("psdq_sf")));
    expect(m.authoritative.value).toBe(1);
    expect(m.authoritarian.value).toBe(1);
    expect(m.permissive.value).toBe(1);
  });

  it("(c) hand-worked: permissive [1,2,3,4,5] = 3; authoritarian eleven 2s and one 5 = 27/12 = 2.25", () => {
    const rs = responsesFrom(
      "psdq_sf",
      { psdq_sf_4: 1, psdq_sf_8: 2, psdq_sf_15: 3, psdq_sf_20: 4, psdq_sf_24: 5, psdq_sf_2: 5 },
      2,
    );
    const m = scoreMap(score(rs));
    expect(m.permissive.value).toBe(3);
    expect(m.authoritarian.value).toBe(2.25);
    expect(m.authoritative.value).toBe(2);
  });

  it("(d) no reverse items: raising one permissive item by 5 raises the permissive mean by 1", () => {
    const base = constantResponses("psdq_sf", 3);
    const m = scoreMap(score(setItem(base, "psdq_sf_4", 5)));
    expect(m.permissive.value).toBe(3.4);
    expect(m.authoritative.value).toBe(3);
    expect(m.authoritarian.value).toBe(3);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("psdq_sf", 3);
    expect(() => score(withoutItem(base, "psdq_sf_32"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "psdq_sf_1", 6))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "psdq_sf_1", 0))).toThrow(InvalidResponseError);
  });
});
