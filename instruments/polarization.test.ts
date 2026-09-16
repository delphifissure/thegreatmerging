/**
 * Polarization block (original, UNVALIDATED): 10 dimensions rated 1–7 on three passes
 *   self_alone, self_with_partner, partner_becomes.
 * No subscales, so score() never emits a Score row; deriveMetrics emits value:<pass> per item and
 * gap = self_with_partner - self_alone. Every derived metric must carry unvalidated: true.
 * Couple-level loops are covered in tests/unit/couple.test.ts.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError, scoreDefinition } from "@/instruments/define";
import { deriveMetrics, metricMap } from "@/instruments/derived";
import { definition, score } from "@/instruments/polarization";
import { constantResponses, fullResponses, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("polarization", () => {
  it("definition is flagged unvalidated and matches the key these tests are derived from", () => {
    expect(definition.unvalidated).toBe(true);
    expect(definition.mental_health).toBe(false);
    expect(definition.passes).toEqual(["self_alone", "self_with_partner", "partner_becomes"]);
    expect(definition.items).toHaveLength(10);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 1, max: 7 });
    expect(definition.scoring.subscales).toEqual([]);
    expect(definition.items.map((i) => i.domain)).toEqual([
      "parenting", "household", "communication", "communication", "intimacy", "household", "communication", "social_family_longterm", "social_family_longterm", "social_family_longterm",
    ]);
  });

  it("score() emits no Score rows (nothing to score) but still enforces completeness on all three passes", () => {
    const rs = constantResponses("polarization", 4);
    expect(rs).toHaveLength(30);
    expect(score(rs)).toEqual([]);
    expect(() => score(withoutItem(rs, "polarization_10", "partner_becomes"))).toThrow(IncompleteResponsesError);
  });

  it("(f) every Score and DerivedMetric carries unvalidated: true", () => {
    const rs = fullResponses("polarization", (item, pass) => {
      if (item.item_id === "polarization_1") return pass === "self_alone" ? 2 : pass === "self_with_partner" ? 5 : 6;
      if (item.item_id === "polarization_2") return pass === "self_alone" ? 6 : pass === "self_with_partner" ? 3 : 1;
      return 4;
    });
    // Scores: the generic scorer tags every row for an unvalidated definition; with no subscales the list is empty,
    // so also prove the tagging path with a synthetic one-subscale copy of the definition.
    const scores = score(rs);
    expect(scores).toEqual([]);
    const withSubscale = {
      ...definition,
      scoring: { ...definition.scoring, subscales: [{ name: "alone_mean", method: "mean" as const, pass: "self_alone", items: definition.items.map((i) => i.item_id) }] },
    };
    const tagged = scoreDefinition(withSubscale, rs);
    expect(tagged).toHaveLength(1);
    expect(tagged[0].unvalidated).toBe(true);
    expect(tagged[0].value).toBe((2 + 6 + 8 * 4) / 10);
    // Derived metrics: 10 items x 3 passes + 10 gaps = 40, all tagged
    const d = deriveMetrics(definition, rs);
    expect(d).toHaveLength(40);
    expect(d.every((m) => m.unvalidated === true)).toBe(true);
    expect(d.every((m) => m.instrument_key === "polarization")).toBe(true);
  });

  it("gap = self_with_partner - self_alone, signed", () => {
    const rs = fullResponses("polarization", (item, pass) => {
      if (item.item_id === "polarization_1") return pass === "self_alone" ? 2 : pass === "self_with_partner" ? 5 : 4; // +3
      if (item.item_id === "polarization_2") return pass === "self_alone" ? 6 : pass === "self_with_partner" ? 3 : 4; // -3
      if (item.item_id === "polarization_3") return pass === "self_alone" ? 7 : pass === "self_with_partner" ? 1 : 7; // -6
      return 4; // 0
    });
    const gap = metricMap(deriveMetrics(definition, rs), "gap");
    expect(gap.get("polarization_1")).toBe(3);
    expect(gap.get("polarization_2")).toBe(-3);
    expect(gap.get("polarization_3")).toBe(-6);
    expect(gap.get("polarization_4")).toBe(0);
    // partner_becomes never enters the gap
    const moved = setItem(rs, "polarization_4", 7, "partner_becomes");
    expect(metricMap(deriveMetrics(definition, moved), "gap").get("polarization_4")).toBe(0);
    expect(metricMap(deriveMetrics(definition, moved), "value:partner_becomes").get("polarization_4")).toBe(7);
  });

  it("deriveMetrics without both self passes yields no gap", () => {
    const d = deriveMetrics(definition, [{ item_id: "polarization_1", value: 2, pass: "self_alone" }]);
    expect(d).toEqual([{ instrument_key: "polarization", metric: "value:self_alone", item_id: "polarization_1", value: 2, unvalidated: true }]);
  });

  it("(e) InvalidResponseError outside 1..7 and on an unknown pass", () => {
    const base = constantResponses("polarization", 4);
    expect(() => score(setItem(base, "polarization_1", 8, "self_alone"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "polarization_1", 0, "self_with_partner"))).toThrow(InvalidResponseError);
    expect(() => score([...base, { item_id: "polarization_1", value: 4, pass: "partner_alone" }])).toThrow(InvalidResponseError);
  });
});
