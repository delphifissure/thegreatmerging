/**
 * PHQ-9 (Kroenke, Spitzer & Williams 2001): sum of 9 items scored 0–3, total 0–27.
 * Severity bands: 0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 moderately severe, 20–27 severe.
 * Item 9 is the safety item; it is part of the total like any other item.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/phq9";
import { constantResponses, maxResponses, minResponses, responsesFrom, setItem, withoutItem } from "@/tests/unit/helpers/responses";

/** First `k` items at `v`, the rest at 0 (plus an optional extra item value). */
function firstK(k: number, v: number, extra: Record<string, number> = {}) {
  const values: Record<string, number> = {};
  for (let i = 1; i <= k; i++) values[`phq9_${i}`] = v;
  return responsesFrom("phq9", { ...values, ...extra }, 0);
}
const total = (rs: ReturnType<typeof firstK>) => score(rs)[0];

describe("phq9", () => {
  it("definition matches the published key", () => {
    expect(definition.mental_health).toBe(true);
    expect(definition.items).toHaveLength(9);
    for (const item of definition.items) {
      expect(item.scale).toMatchObject({ min: 0, max: 3 });
      expect(item.reverse_scored).toBe(false);
    }
    expect(definition.items.filter((i) => i.safety_item).map((i) => i.item_id)).toEqual(["phq9_9"]);
    expect(definition.scoring.subscales).toHaveLength(1);
    expect(definition.scoring.subscales[0]).toMatchObject({ name: "total", method: "sum" });
  });

  it("(a) max: 3 on every item = 27 -> severe", () => {
    const t = total(maxResponses("phq9"));
    expect(t).toMatchObject({ instrument_key: "phq9", subscale: "total", value: 27, cutoff_label: "severe", scoring_version: "1.0.0" });
    expect(score(maxResponses("phq9"))).toHaveLength(1);
  });

  it("(b) min: 0 on every item = 0 -> minimal", () => {
    expect(total(minResponses("phq9"))).toMatchObject({ value: 0, cutoff_label: "minimal" });
  });

  it("(c) published examples: 2 on every item = 18 moderately_severe; 1 on every item = 9 mild", () => {
    expect(total(constantResponses("phq9", 2))).toMatchObject({ value: 18, cutoff_label: "moderately_severe" });
    expect(total(constantResponses("phq9", 1))).toMatchObject({ value: 9, cutoff_label: "mild" });
  });

  it("(c') every band boundary", () => {
    expect(total(firstK(4, 1))).toMatchObject({ value: 4, cutoff_label: "minimal" });
    expect(total(firstK(5, 1))).toMatchObject({ value: 5, cutoff_label: "mild" });
    expect(total(firstK(9, 1))).toMatchObject({ value: 9, cutoff_label: "mild" });
    expect(total(firstK(5, 2))).toMatchObject({ value: 10, cutoff_label: "moderate" });
    expect(total(firstK(4, 3, { phq9_5: 2 }))).toMatchObject({ value: 14, cutoff_label: "moderate" });
    expect(total(firstK(5, 3))).toMatchObject({ value: 15, cutoff_label: "moderately_severe" });
    expect(total(firstK(6, 3, { phq9_7: 1 }))).toMatchObject({ value: 19, cutoff_label: "moderately_severe" });
    expect(total(firstK(6, 3, { phq9_7: 2 }))).toMatchObject({ value: 20, cutoff_label: "severe" });
  });

  it("the safety item counts toward the total like any other item", () => {
    expect(total(responsesFrom("phq9", { phq9_9: 3 }, 0))).toMatchObject({ value: 3, cutoff_label: "minimal" });
  });

  it("(d) no reverse-scored items: raising any item raises the total by the same amount", () => {
    const base = constantResponses("phq9", 1);
    for (const item of definition.items) expect(total(setItem(base, item.item_id, 3)).value).toBe(11);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("phq9", 1);
    expect(() => score(withoutItem(base, "phq9_9"))).toThrow(IncompleteResponsesError);
    expect(() => score([])).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "phq9_1", 4))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "phq9_1", -1))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "phq9_1", 1.5))).toThrow(InvalidResponseError);
  });
});
