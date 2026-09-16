/**
 * Marital Agendas Protocol (Notarius & Vanzetti 1983): 10 problem areas, two passes on 0–100:
 *   intensity (how much of a problem) and efficacy (percent chance the couple can resolve it).
 * Subscales: intensity_mean (pass intensity) and efficacy_mean (pass efficacy), plain means.
 * Domains per config: 1 household, 2 conflict, 3 intimacy, 4/5/6 social_family_longterm, 7 self_care,
 * 8 parenting, 9 conflict, 10 social_family_longterm. Couple-level detection is in tests/unit/couple.test.ts.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { deriveMetrics, metricMap } from "@/instruments/derived";
import { definition, score } from "@/instruments/map";
import { fullResponses, maxResponses, minResponses, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("map", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.passes).toEqual(["intensity", "efficacy"]);
    expect(definition.items).toHaveLength(10);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 0, max: 100 });
    expect(definition.scoring.subscales).toEqual([
      { name: "intensity_mean", method: "mean", pass: "intensity", items: definition.items.map((i) => i.item_id) },
      { name: "efficacy_mean", method: "mean", pass: "efficacy", items: definition.items.map((i) => i.item_id) },
    ]);
    expect(definition.items.map((i) => i.domain)).toEqual([
      "household", "conflict", "intimacy", "social_family_longterm", "social_family_longterm", "social_family_longterm", "self_care", "parenting", "conflict", "social_family_longterm",
    ]);
  });

  it("(a) max: 100 on both passes -> both means 100", () => {
    const m = scoreMap(score(maxResponses("map")));
    expect(m.intensity_mean).toMatchObject({ value: 100, cutoff_label: null });
    expect(m.efficacy_mean).toMatchObject({ value: 100, cutoff_label: null });
  });

  it("(b) min: 0 on both passes -> both means 0", () => {
    const m = scoreMap(score(minResponses("map")));
    expect(m.intensity_mean.value).toBe(0);
    expect(m.efficacy_mean.value).toBe(0);
  });

  it("(c) hand-worked: intensity 10,20,...,100 -> mean 55; efficacy all 40 -> 40; each subscale reads only its pass", () => {
    const rs = fullResponses("map", (item, pass) => (pass === "intensity" ? 10 * Number(item.item_id.split("_")[1]) : 40));
    const m = scoreMap(score(rs));
    expect(m.intensity_mean.value).toBe(55);
    expect(m.efficacy_mean.value).toBe(40);
    const m2 = scoreMap(score(setItem(rs, "map_1", 100, "efficacy")));
    expect(m2.intensity_mean.value).toBe(55);
    expect(m2.efficacy_mean.value).toBe(46);
  });

  it("deriveMetrics yields raw per-pass values", () => {
    const rs = setItem(setItem(minResponses("map"), "map_8", 75, "intensity"), "map_8", 25, "efficacy");
    const d = deriveMetrics(definition, rs);
    expect(d).toHaveLength(20);
    expect(metricMap(d, "value:intensity").get("map_8")).toBe(75);
    expect(metricMap(d, "value:efficacy").get("map_8")).toBe(25);
    expect(metricMap(d, "value:intensity").get("map_1")).toBe(0);
  });

  it("(d) no reverse items: raising an intensity item raises intensity_mean by a tenth of the change", () => {
    const m = scoreMap(score(setItem(minResponses("map"), "map_3", 50, "intensity")));
    expect(m.intensity_mean.value).toBe(5);
    expect(m.efficacy_mean.value).toBe(0);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = minResponses("map");
    expect(() => score(withoutItem(base, "map_10", "efficacy"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "map_1", 101, "intensity"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "map_1", -1, "efficacy"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "map_1", 100, "efficacy"))).not.toThrow();
  });
});
