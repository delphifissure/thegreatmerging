/**
 * SIS/SES-SF (Carpenter et al. 2008): 14 items answered 1 (strongly agree) .. 4 (strongly disagree),
 * every item reverse-keyed (scored = 1 + 4 - raw = 5 - raw) so higher = more excitation / inhibition.
 * Per config: SES = items 1–6 (6–24), SIS1 = items 7–10 (4–16), SIS2 = items 11–14 (4–16), sum_reverse_aware.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/sis_ses_sf";
import { constantResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("sis_ses_sf", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.items).toHaveLength(14);
    for (const item of definition.items) {
      expect(item.reverse_scored).toBe(true);
      expect(item.scale).toMatchObject({ min: 1, max: 4 });
    }
    expect(definition.scoring.subscales.map((s) => [s.name, s.method, s.items.length])).toEqual([
      ["ses", "sum_reverse_aware", 6],
      ["sis1", "sum_reverse_aware", 4],
      ["sis2", "sum_reverse_aware", 4],
    ]);
  });

  it("(a)/(c) max: 'strongly agree' (1) on every item reverse-keys to 4 each: ses 24, sis1 16, sis2 16", () => {
    const m = scoreMap(score(constantResponses("sis_ses_sf", 1)));
    expect(m.ses.value).toBe(24);
    expect(m.sis1.value).toBe(16);
    expect(m.sis2.value).toBe(16);
    for (const s of Object.values(m)) expect(s.cutoff_label).toBeNull();
  });

  it("(b) min: 'strongly disagree' (4) on every item reverse-keys to 1 each: ses 6, sis1 4, sis2 4", () => {
    const m = scoreMap(score(constantResponses("sis_ses_sf", 4)));
    expect(m.ses.value).toBe(6);
    expect(m.sis1.value).toBe(4);
    expect(m.sis2.value).toBe(4);
  });

  it("(c') hand-worked mixed responses", () => {
    // ses raw [1,2,3,4,1,2] -> scored [4,3,2,1,4,3] = 17
    // sis1 raw [1,1,4,4]    -> scored [4,4,1,1]     = 10
    // sis2 raw [2,2,2,3]    -> scored [3,3,3,2]     = 11
    const rs = responsesFrom("sis_ses_sf", {
      sis_ses_sf_1: 1, sis_ses_sf_2: 2, sis_ses_sf_3: 3, sis_ses_sf_4: 4, sis_ses_sf_5: 1, sis_ses_sf_6: 2,
      sis_ses_sf_7: 1, sis_ses_sf_8: 1, sis_ses_sf_9: 4, sis_ses_sf_10: 4,
      sis_ses_sf_11: 2, sis_ses_sf_12: 2, sis_ses_sf_13: 2, sis_ses_sf_14: 3,
    });
    const m = scoreMap(score(rs));
    expect(m.ses.value).toBe(17);
    expect(m.sis1.value).toBe(10);
    expect(m.sis2.value).toBe(11);
  });

  it("(d) raising a raw (reverse-keyed) item lowers its subscale and leaves the others alone", () => {
    const base = constantResponses("sis_ses_sf", 2); // each item scores 3: ses 18, sis1 12, sis2 12
    expect(scoreMap(score(base)).ses.value).toBe(18);
    // item 1: 2 -> 4 scores 1 instead of 3: 18 - 2 = 16
    const m = scoreMap(score(setItem(base, "sis_ses_sf_1", 4)));
    expect(m.ses.value).toBe(16);
    expect(m.sis1.value).toBe(12);
    expect(m.sis2.value).toBe(12);
    // item 14: 2 -> 1 scores 4: sis2 12 + 1 = 13
    expect(scoreMap(score(setItem(base, "sis_ses_sf_14", 1))).sis2.value).toBe(13);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("sis_ses_sf", 2);
    expect(() => score(withoutItem(base, "sis_ses_sf_7"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "sis_ses_sf_7", 5))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "sis_ses_sf_7", 0))).toThrow(InvalidResponseError);
  });
});
