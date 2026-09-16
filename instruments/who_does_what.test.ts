/**
 * Who Does What? (Cowan & Cowan): 24 rows rated 1 (I do it all) .. 9 (partner does it all), two passes
 * "now" and "ideal". No subscales. Derived per person: now_ideal_gap = |now - ideal|.
 * Domains per config: rows 1–17 household, 18–20 social_family_longterm, 21–24 parenting.
 * Couple-level "now" mirroring is covered in tests/unit/couple.test.ts.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { deriveMetrics, metricMap } from "@/instruments/derived";
import { definition, score } from "@/instruments/who_does_what";
import { constantResponses, fullResponses, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("who_does_what", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.passes).toEqual(["now", "ideal"]);
    expect(definition.items).toHaveLength(24);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 1, max: 9 });
    expect(definition.scoring.subscales).toEqual([]);
    expect(definition.default_domain).toBe("household");
    const domain = (n: number) => definition.items[n - 1].domain;
    for (let n = 1; n <= 17; n++) expect(domain(n)).toBe("household");
    for (let n = 18; n <= 20; n++) expect(domain(n)).toBe("social_family_longterm");
    for (let n = 21; n <= 24; n++) expect(domain(n)).toBe("parenting");
  });

  it("score() returns no Score rows and enforces completeness across both passes", () => {
    const rs = constantResponses("who_does_what", 5);
    expect(rs).toHaveLength(48);
    expect(score(rs)).toEqual([]);
    expect(() => score(withoutItem(rs, "who_does_what_24", "ideal"))).toThrow(IncompleteResponsesError);
  });

  it("deriveMetrics: now_ideal_gap is the absolute now-versus-ideal difference per row", () => {
    const rs = fullResponses("who_does_what", (item, pass) => {
      if (item.item_id === "who_does_what_1") return pass === "now" ? 2 : 5; // gap 3
      if (item.item_id === "who_does_what_2") return pass === "now" ? 7 : 5; // gap 2
      if (item.item_id === "who_does_what_3") return pass === "now" ? 9 : 1; // gap 8
      return 5; // gap 0
    });
    const d = deriveMetrics(definition, rs);
    // 24 rows x (value:now, value:ideal, now_ideal_gap)
    expect(d).toHaveLength(72);
    const gap = metricMap(d, "now_ideal_gap");
    expect(gap.get("who_does_what_1")).toBe(3);
    expect(gap.get("who_does_what_2")).toBe(2);
    expect(gap.get("who_does_what_3")).toBe(8);
    expect(gap.get("who_does_what_4")).toBe(0);
    expect(metricMap(d, "value:now").get("who_does_what_1")).toBe(2);
    expect(metricMap(d, "value:ideal").get("who_does_what_1")).toBe(5);
    expect(d.every((m) => m.unvalidated === undefined)).toBe(true);
  });

  it("deriveMetrics skips the gap when only one pass is present", () => {
    const d = deriveMetrics(definition, [{ item_id: "who_does_what_1", value: 2, pass: "now" }]);
    expect(d).toEqual([{ instrument_key: "who_does_what", metric: "value:now", item_id: "who_does_what_1", value: 2 }]);
  });

  it("(e) InvalidResponseError outside 1..9", () => {
    const base = constantResponses("who_does_what", 5);
    expect(() => score(setItem(base, "who_does_what_1", 10, "now"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "who_does_what_1", 0, "ideal"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "who_does_what_1", 9, "ideal"))).not.toThrow();
  });
});
