/**
 * RDAS (Busby et al. 1995): values stored as printed scoring values, no reverse scoring in code.
 *   consensus    = items 1–6   (0–5 each)          0–30
 *   satisfaction = items 7–10  (0–5 each)          0–20
 *   cohesion     = items 11–14 (item 11 is 0–4)    0–19
 *   total        = items 1–14                      0–69, cutoff 48 (below -> distressed, at or above -> non_distressed)
 */
import { describe, expect, it } from "vitest";
import { cutoffLabel, IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/rdas";
import { maxResponses, minResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("rdas", () => {
  it("definition matches the published key", () => {
    expect(definition.items).toHaveLength(14);
    expect(definition.items.find((i) => i.item_id === "rdas_11")!.scale).toMatchObject({ min: 0, max: 4 });
    for (const item of definition.items.filter((i) => i.item_id !== "rdas_11")) expect(item.scale).toMatchObject({ min: 0, max: 5 });
    expect(definition.items.every((i) => !i.reverse_scored)).toBe(true);
    expect(definition.scoring.subscales.map((s) => [s.name, s.method, s.items.length])).toEqual([
      ["consensus", "sum", 6],
      ["satisfaction", "sum", 4],
      ["cohesion", "sum", 4],
      ["total", "sum", 14],
    ]);
    expect(definition.scoring.subscales.find((s) => s.name === "consensus")!.items).toEqual([1, 2, 3, 4, 5, 6].map((n) => `rdas_${n}`));
  });

  it("(a) max: consensus 30, satisfaction 20, cohesion 19, total 69 -> non_distressed", () => {
    const m = scoreMap(score(maxResponses("rdas")));
    expect(m.consensus.value).toBe(30);
    expect(m.satisfaction.value).toBe(20);
    expect(m.cohesion.value).toBe(19);
    expect(m.total).toMatchObject({ value: 69, cutoff_label: "non_distressed" });
    expect(m.consensus.cutoff_label).toBeNull();
  });

  it("(b) min: 0 everywhere -> distressed", () => {
    const m = scoreMap(score(minResponses("rdas")));
    expect(m.consensus.value).toBe(0);
    expect(m.satisfaction.value).toBe(0);
    expect(m.cohesion.value).toBe(0);
    expect(m.total).toMatchObject({ value: 0, cutoff_label: "distressed" });
  });

  it("(c) 47 -> distressed, 48 -> non_distressed", () => {
    // consensus 30 (six 5s) + satisfaction 5 + 5 + 5 + 3 = 18 + cohesion 0 -> 48
    const consensusMax: Record<string, number> = {};
    for (let i = 1; i <= 6; i++) consensusMax[`rdas_${i}`] = 5;
    const fortyEight = responsesFrom("rdas", { ...consensusMax, rdas_7: 5, rdas_8: 5, rdas_9: 5, rdas_10: 3 }, 0);
    expect(scoreMap(score(fortyEight)).total).toMatchObject({ value: 48, cutoff_label: "non_distressed" });
    expect(scoreMap(score(setItem(fortyEight, "rdas_10", 2))).total).toMatchObject({ value: 47, cutoff_label: "distressed" });
    expect(cutoffLabel(definition.scoring.cutoffs, "total", 47.99)).toBe("distressed");
    expect(cutoffLabel(definition.scoring.cutoffs, "total", 48)).toBe("non_distressed");
  });

  it("(c') hand-worked consensus [5,4,3,2,1,0] = 15 and cohesion [4,5,0,1] = 10", () => {
    const rs = responsesFrom("rdas", { rdas_1: 5, rdas_2: 4, rdas_3: 3, rdas_4: 2, rdas_5: 1, rdas_6: 0, rdas_11: 4, rdas_12: 5, rdas_13: 0, rdas_14: 1 }, 0);
    const m = scoreMap(score(rs));
    expect(m.consensus.value).toBe(15);
    expect(m.cohesion.value).toBe(10);
    expect(m.satisfaction.value).toBe(0);
    expect(m.total).toMatchObject({ value: 25, cutoff_label: "distressed" });
  });

  it("(d) no reverse items: raising a consensus item raises consensus and total only", () => {
    const m = scoreMap(score(setItem(minResponses("rdas"), "rdas_2", 3)));
    expect(m.consensus.value).toBe(3);
    expect(m.satisfaction.value).toBe(0);
    expect(m.cohesion.value).toBe(0);
    expect(m.total.value).toBe(3);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError on per-item ranges", () => {
    const base = minResponses("rdas");
    expect(() => score(withoutItem(base, "rdas_14"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "rdas_11", 5))).toThrow(InvalidResponseError); // item 11 is 0–4
    expect(() => score(setItem(base, "rdas_12", 5))).not.toThrow();
    expect(() => score(setItem(base, "rdas_12", 6))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "rdas_1", -1))).toThrow(InvalidResponseError);
  });
});
