/**
 * CSI-16 (Funk & Rogge 2007): values stored as the printed scoring values (item 1 is 0–6, items 2–16 are 0–5),
 * total = plain sum 0–81, distress cutoff 51.5 (below -> distressed, at or above -> non_distressed).
 * No reverse scoring in code.
 */
import { describe, expect, it } from "vitest";
import { cutoffLabel, IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/csi16";
import { maxResponses, minResponses, responsesFrom, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const total = (rs: ReturnType<typeof maxResponses>) => score(rs)[0];

describe("csi16", () => {
  it("definition matches the published key", () => {
    expect(definition.items).toHaveLength(16);
    expect(definition.items[0]).toMatchObject({ item_id: "csi16_1", scale: { min: 0, max: 6 } });
    for (const item of definition.items.slice(1)) expect(item.scale).toMatchObject({ min: 0, max: 5 });
    expect(definition.items.every((i) => !i.reverse_scored)).toBe(true);
    expect(definition.scoring.subscales).toEqual([{ name: "total", method: "sum", items: definition.items.map((i) => i.item_id) }]);
    expect(definition.scoring.cutoffs).toEqual([
      { subscale: "total", below: 51.5, label: "distressed" },
      { subscale: "total", at_or_above: 51.5, label: "non_distressed" },
    ]);
  });

  it("(a) max: 6 + 15 * 5 = 81 -> non_distressed", () => {
    expect(total(maxResponses("csi16"))).toMatchObject({ instrument_key: "csi16", subscale: "total", value: 81, cutoff_label: "non_distressed" });
  });

  it("(b) min: 0 -> distressed", () => {
    expect(total(minResponses("csi16"))).toMatchObject({ value: 0, cutoff_label: "distressed" });
  });

  it("(c) 51 -> distressed, 52 -> non_distressed", () => {
    // item 1 = 6, items 2–10 = 5 (45) -> 51, the rest 0
    const nine: Record<string, number> = {};
    for (let i = 2; i <= 10; i++) nine[`csi16_${i}`] = 5;
    const fiftyOne = responsesFrom("csi16", { csi16_1: 6, ...nine }, 0);
    expect(total(fiftyOne)).toMatchObject({ value: 51, cutoff_label: "distressed" });
    expect(total(setItem(fiftyOne, "csi16_11", 1))).toMatchObject({ value: 52, cutoff_label: "non_distressed" });
  });

  it("(c') the exact boundary rule is 51.5", () => {
    expect(cutoffLabel(definition.scoring.cutoffs, "total", 51.5)).toBe("non_distressed");
    expect(cutoffLabel(definition.scoring.cutoffs, "total", 51.49)).toBe("distressed");
    expect(cutoffLabel(definition.scoring.cutoffs, "total", 51)).toBe("distressed");
    expect(cutoffLabel(definition.scoring.cutoffs, "total", 52)).toBe("non_distressed");
  });

  it("(d) no reverse items: raising any item raises the total by the same amount", () => {
    const base = minResponses("csi16");
    expect(total(setItem(base, "csi16_1", 6)).value).toBe(6);
    expect(total(setItem(base, "csi16_16", 5)).value).toBe(5);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError on per-item ranges", () => {
    const base = minResponses("csi16");
    expect(() => score(withoutItem(base, "csi16_16"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "csi16_1", 7))).toThrow(InvalidResponseError); // item 1 is 0–6
    expect(() => score(setItem(base, "csi16_2", 6))).toThrow(InvalidResponseError); // items 2–16 are 0–5
    expect(() => score(setItem(base, "csi16_2", -1))).toThrow(InvalidResponseError);
  });
});
