/**
 * Brief Coparenting Relationship Scale (Feinberg et al. 2012): 14 items 0–6, seven 2-item mean subscales per config:
 *   agreement 1–2 | closeness 3–4 | exposure_to_conflict 5–6 | support 7–8 | undermining 9–10 | endorsement 11–12 | division_of_labor 13–14
 * No reverse scoring in code, no cutoffs. The weight-3 parenting flag (undermining or exposure above 3) is in stage1.test.ts.
 */
import { describe, expect, it } from "vitest";
import { definition, score } from "@/instruments/brief_crs";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { maxResponses, minResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const SUBSCALES = ["agreement", "closeness", "exposure_to_conflict", "support", "undermining", "endorsement", "division_of_labor"];

describe("brief_crs", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.items).toHaveLength(14);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 0, max: 6 });
    expect(definition.items.every((i) => !i.reverse_scored)).toBe(true);
    expect(definition.scoring.subscales.map((s) => [s.name, s.method, s.items])).toEqual(
      SUBSCALES.map((name, i) => [name, "mean", [`brief_crs_${2 * i + 1}`, `brief_crs_${2 * i + 2}`]]),
    );
    expect(definition.default_domain).toBe("parenting");
  });

  it("(a) max: 6 everywhere -> every subscale mean 6", () => {
    const m = scoreMap(score(maxResponses("brief_crs")));
    for (const s of SUBSCALES) expect(m[s]).toMatchObject({ value: 6, cutoff_label: null });
  });

  it("(b) min: 0 everywhere -> every subscale mean 0", () => {
    const m = scoreMap(score(minResponses("brief_crs")));
    for (const s of SUBSCALES) expect(m[s].value).toBe(0);
  });

  it("(c) hand-worked means: undermining (4 + 5)/2 = 4.5, exposure (3 + 0)/2 = 1.5, agreement (6 + 1)/2 = 3.5", () => {
    const m = scoreMap(score(responsesFrom("brief_crs", { brief_crs_9: 4, brief_crs_10: 5, brief_crs_5: 3, brief_crs_6: 0, brief_crs_1: 6, brief_crs_2: 1 }, 2)));
    expect(m.undermining.value).toBe(4.5);
    expect(m.exposure_to_conflict.value).toBe(1.5);
    expect(m.agreement.value).toBe(3.5);
    expect(m.support.value).toBe(2);
  });

  it("(d) no reverse items: raising one item raises only its subscale, by half the change", () => {
    const m = scoreMap(score(setItem(minResponses("brief_crs"), "brief_crs_13", 6)));
    expect(m.division_of_labor.value).toBe(3);
    for (const s of SUBSCALES.filter((x) => x !== "division_of_labor")) expect(m[s].value).toBe(0);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = minResponses("brief_crs");
    expect(() => score(withoutItem(base, "brief_crs_14"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "brief_crs_1", 7))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "brief_crs_1", -1))).toThrow(InvalidResponseError);
  });
});
