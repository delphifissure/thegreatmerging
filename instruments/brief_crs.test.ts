/**
 * Brief Coparenting Relationship Scale (Feinberg, Brown & Kan 2012; key verified from the open-access
 * article, see config notes): 14 items 0–6, in ascending CRS order 1, 2, 4, 5, 6, 9, 16, 20, 22, 24, 25, 27, 33, 34.
 * Seven 2-item mean subscales (positions in this file):
 *   endorsement {1, 3} | closeness {2, 10} | division_of_labor {4, 8} | agreement {5, 6}
 *   undermining {7, 9} | support {11, 12} | exposure_to_conflict {13, 14}
 * Reverse-keyed within their subscales: position 6 (CRS 9, agreement) and position 8 (CRS 20, division of labor).
 * The weight-3 parenting flag (undermining or exposure above 3) is in stage1.test.ts.
 */
import { describe, expect, it } from "vitest";
import { definition, score } from "@/instruments/brief_crs";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { maxResponses, minResponses, responsesFrom, scoreMap, withoutItem } from "@/tests/unit/helpers/responses";

const KEY: Record<string, string[]> = {
  agreement: ["brief_crs_5", "brief_crs_6"],
  closeness: ["brief_crs_2", "brief_crs_10"],
  exposure_to_conflict: ["brief_crs_13", "brief_crs_14"],
  support: ["brief_crs_11", "brief_crs_12"],
  undermining: ["brief_crs_7", "brief_crs_9"],
  endorsement: ["brief_crs_1", "brief_crs_3"],
  division_of_labor: ["brief_crs_4", "brief_crs_8"],
};
const REVERSE = ["brief_crs_6", "brief_crs_8"];
const SUBSCALES = Object.keys(KEY);

describe("brief_crs", () => {
  it("definition matches the verified key", () => {
    expect(definition.items).toHaveLength(14);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 0, max: 6 });
    expect(definition.items.filter((i) => i.reverse_scored).map((i) => i.item_id)).toEqual(REVERSE);
    for (const sub of definition.scoring.subscales) {
      expect(sub.method).toBe("mean_reverse_aware");
      expect(sub.items).toEqual(KEY[sub.name]);
    }
    expect(definition.scoring.subscales.map((s) => s.name).sort()).toEqual([...SUBSCALES].sort());
    expect(definition.default_domain).toBe("parenting");
    expect(definition.scoring_key_verified).toBe(true);
  });

  it("(a) max: 6 everywhere -> 6 on every subscale except the two with a reverse item, which are (6 + 0) / 2 = 3", () => {
    const m = scoreMap(score(maxResponses("brief_crs")));
    for (const s of SUBSCALES) expect(m[s].value).toBe(s === "agreement" || s === "division_of_labor" ? 3 : 6);
    expect(m.agreement.cutoff_label).toBeNull();
  });

  it("(b) min: 0 everywhere -> 0 except agreement and division of labor at (0 + 6) / 2 = 3", () => {
    const m = scoreMap(score(minResponses("brief_crs")));
    for (const s of SUBSCALES) expect(m[s].value).toBe(s === "agreement" || s === "division_of_labor" ? 3 : 0);
  });

  it("(c) hand-worked means with the reverse items", () => {
    // agreement: item 5 = 6, item 6 = 1 (reversed to 5) -> (6 + 5) / 2 = 5.5
    // division: item 4 = 2, item 8 = 6 (reversed to 0) -> (2 + 0) / 2 = 1
    // undermining: 4 and 5 -> 4.5; exposure: 3 and 0 -> 1.5; everything else 2
    const m = scoreMap(
      score(responsesFrom("brief_crs", { brief_crs_5: 6, brief_crs_6: 1, brief_crs_4: 2, brief_crs_8: 6, brief_crs_7: 4, brief_crs_9: 5, brief_crs_13: 3, brief_crs_14: 0 }, 2)),
    );
    expect(m.agreement.value).toBe(5.5);
    expect(m.division_of_labor.value).toBe(1);
    expect(m.undermining.value).toBe(4.5);
    expect(m.exposure_to_conflict.value).toBe(1.5);
    expect(m.support.value).toBe(2);
    expect(m.endorsement.value).toBe(2);
    expect(m.closeness.value).toBe(2);
  });

  it("(d) raising a reverse item lowers its subscale; raising a keyed item raises only its own subscale", () => {
    const base = scoreMap(score(responsesFrom("brief_crs", {}, 3)));
    const rev = scoreMap(score(responsesFrom("brief_crs", { brief_crs_6: 5 }, 3)));
    expect(rev.agreement.value).toBe(base.agreement.value - 1); // 5 reverses to 1: (3 + 1) / 2 = 2
    const fwd = scoreMap(score(responsesFrom("brief_crs", { brief_crs_7: 5 }, 3)));
    expect(fwd.undermining.value).toBe(base.undermining.value + 1);
    for (const s of SUBSCALES) if (s !== "undermining") expect(fwd[s].value).toBe(base[s].value);
  });

  it("(e) incomplete and out-of-range sets are rejected", () => {
    expect(() => score(withoutItem(maxResponses("brief_crs"), "brief_crs_3"))).toThrow(IncompleteResponsesError);
    expect(() => score(responsesFrom("brief_crs", { brief_crs_1: 7 }, 2))).toThrow(InvalidResponseError);
  });
});
