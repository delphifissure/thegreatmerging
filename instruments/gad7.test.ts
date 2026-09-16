/**
 * GAD-7 (Spitzer et al. 2006): sum of 7 items scored 0–3, total 0–21.
 * Severity bands: 0–4 minimal, 5–9 mild, 10–14 moderate, 15–21 severe.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/gad7";
import { constantResponses, maxResponses, minResponses, responsesFrom, setItem, withoutItem } from "@/tests/unit/helpers/responses";

function firstK(k: number, v: number, extra: Record<string, number> = {}) {
  const values: Record<string, number> = {};
  for (let i = 1; i <= k; i++) values[`gad7_${i}`] = v;
  return responsesFrom("gad7", { ...values, ...extra }, 0);
}
const total = (rs: ReturnType<typeof firstK>) => score(rs)[0];

describe("gad7", () => {
  it("definition matches the published key", () => {
    expect(definition.mental_health).toBe(true);
    expect(definition.items).toHaveLength(7);
    for (const item of definition.items) {
      expect(item.scale).toMatchObject({ min: 0, max: 3 });
      expect(item.reverse_scored).toBe(false);
      expect(item.safety_item).toBe(false);
    }
    expect(definition.scoring.subscales).toEqual([{ name: "total", method: "sum", items: definition.items.map((i) => i.item_id) }]);
  });

  it("(a) max: 3 on every item = 21 -> severe", () => {
    expect(total(maxResponses("gad7"))).toMatchObject({ instrument_key: "gad7", subscale: "total", value: 21, cutoff_label: "severe" });
  });

  it("(b) min: 0 on every item = 0 -> minimal", () => {
    expect(total(minResponses("gad7"))).toMatchObject({ value: 0, cutoff_label: "minimal" });
  });

  it("(c) published examples: all 2 = 14 moderate; all 1 = 7 mild; 15 is the severe boundary", () => {
    expect(total(constantResponses("gad7", 2))).toMatchObject({ value: 14, cutoff_label: "moderate" });
    expect(total(constantResponses("gad7", 1))).toMatchObject({ value: 7, cutoff_label: "mild" });
    expect(total(firstK(5, 3))).toMatchObject({ value: 15, cutoff_label: "severe" });
    expect(total(firstK(4, 3, { gad7_5: 2 }))).toMatchObject({ value: 14, cutoff_label: "moderate" });
  });

  it("(c') remaining band boundaries", () => {
    expect(total(firstK(4, 1))).toMatchObject({ value: 4, cutoff_label: "minimal" });
    expect(total(firstK(5, 1))).toMatchObject({ value: 5, cutoff_label: "mild" });
    expect(total(firstK(3, 3))).toMatchObject({ value: 9, cutoff_label: "mild" });
    expect(total(firstK(3, 3, { gad7_4: 1 }))).toMatchObject({ value: 10, cutoff_label: "moderate" });
  });

  it("(d) no reverse-scored items: raising any item raises the total", () => {
    const base = constantResponses("gad7", 1);
    for (const item of definition.items) expect(total(setItem(base, item.item_id, 3)).value).toBe(9);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("gad7", 1);
    expect(() => score(withoutItem(base, "gad7_4"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "gad7_7", 4))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "gad7_7", -1))).toThrow(InvalidResponseError);
  });
});
