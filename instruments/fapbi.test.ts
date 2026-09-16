/**
 * FAPBI (Christensen & Jacobson 1997): 20 behaviors, two passes with different scales via scale_by_pass:
 *   frequency     0–99 (count in the past month)
 *   acceptability 0–9
 * No subscales: score() returns [] and enforces completeness. deriveMetrics yields value:frequency and
 * value:acceptability per item; the flag rule (acceptability <= 4) is exercised in tests/unit/stage1.test.ts.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError, scaleFor } from "@/instruments/define";
import { deriveMetrics, metricMap } from "@/instruments/derived";
import { definition, score } from "@/instruments/fapbi";
import { fullResponses, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const benign = () => fullResponses("fapbi", (_item, pass) => (pass === "acceptability" ? 9 : 5));

describe("fapbi", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.passes).toEqual(["frequency", "acceptability"]);
    expect(definition.items).toHaveLength(20);
    for (const item of definition.items) {
      expect(scaleFor(item, "frequency")).toMatchObject({ min: 0, max: 99 });
      expect(scaleFor(item, "acceptability")).toMatchObject({ min: 0, max: 9 });
      expect(scaleFor(item)).toMatchObject({ min: 0, max: 99 }); // no pass -> the item's base scale
      expect(item.reverse_scored).toBe(false);
    }
    expect(definition.scoring.subscales).toEqual([]);
  });

  it("score() returns no Score rows and enforces completeness across both passes", () => {
    const rs = benign();
    expect(rs).toHaveLength(40);
    expect(score(rs)).toEqual([]);
    expect(() => score(withoutItem(rs, "fapbi_20", "acceptability"))).toThrow(IncompleteResponsesError);
    expect(() => score(withoutItem(rs, "fapbi_1", "frequency"))).toThrow(IncompleteResponsesError);
  });

  it("deriveMetrics yields raw per-pass values", () => {
    const rs = setItem(setItem(benign(), "fapbi_3", 42, "frequency"), "fapbi_3", 2, "acceptability");
    const d = deriveMetrics(definition, rs);
    expect(d).toHaveLength(40);
    expect(metricMap(d, "value:frequency").get("fapbi_3")).toBe(42);
    expect(metricMap(d, "value:acceptability").get("fapbi_3")).toBe(2);
    expect(metricMap(d, "value:frequency").get("fapbi_1")).toBe(5);
    expect(metricMap(d, "value:acceptability").get("fapbi_1")).toBe(9);
    expect(d.every((m) => m.unvalidated === undefined)).toBe(true);
  });

  it("(e) enforces the pass-specific scale: acceptability 10 is invalid, frequency 10 is fine", () => {
    const rs = benign();
    expect(() => score(setItem(rs, "fapbi_1", 10, "acceptability"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(rs, "fapbi_1", 10, "acceptability"))).toThrow(/outside scale 0\.\.9/);
    expect(() => score(setItem(rs, "fapbi_1", 10, "frequency"))).not.toThrow();
    expect(() => score(setItem(rs, "fapbi_1", 99, "frequency"))).not.toThrow();
    expect(() => score(setItem(rs, "fapbi_1", 100, "frequency"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(rs, "fapbi_1", -1, "acceptability"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(rs, "fapbi_1", 9, "acceptability"))).not.toThrow();
  });

  it("(e') a response without a pass is validated against the first pass (frequency, 0–99)", () => {
    expect(() => deriveMetrics(definition, [{ item_id: "fapbi_1", value: 50 }])).not.toThrow();
    expect(() => deriveMetrics(definition, [{ item_id: "fapbi_1", value: 100 }])).toThrow(InvalidResponseError);
  });
});
