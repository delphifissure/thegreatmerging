/**
 * ACQ (Weiss, Hops & Patterson 1973): 34 items on a -3..+3 scale, two passes:
 *   self          = how much I want my partner to change            -> derived metric desired_change
 *   partner_wants = how much I think my partner wants me to change  -> derived metric perceived_partner_wants
 * No subscales: score() returns [] on a complete set and still enforces completeness.
 * Perceptual accuracy is computed in instruments/couple.ts (tests/unit/couple.test.ts).
 */
import { describe, expect, it } from "vitest";
import { definition, score } from "@/instruments/acq";
import { IncompleteResponsesError, InvalidResponseError, isComplete } from "@/instruments/define";
import { deriveMetrics, metricMap } from "@/instruments/derived";
import { constantResponses, fullResponses, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("acq", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.passes).toEqual(["self", "partner_wants"]);
    expect(definition.items).toHaveLength(34);
    for (const item of definition.items) {
      expect(item.scale).toMatchObject({ min: -3, max: 3 });
      expect(item.reverse_scored).toBe(false);
    }
    expect(definition.scoring.subscales).toEqual([]);
    expect(definition.default_domain).toBe("communication");
  });

  it("score() returns no Score rows but enforces completeness across both passes", () => {
    const full = constantResponses("acq", 0);
    expect(full).toHaveLength(68);
    expect(isComplete(definition, full)).toBe(true);
    expect(score(full)).toEqual([]);
    const missingPartnerPass = withoutItem(full, "acq_34", "partner_wants");
    expect(isComplete(definition, missingPartnerPass)).toBe(false);
    expect(() => score(missingPartnerPass)).toThrow(IncompleteResponsesError);
    try {
      score(missingPartnerPass);
    } catch (e) {
      expect((e as IncompleteResponsesError).missing).toEqual([{ item_id: "acq_34", pass: "partner_wants" }]);
    }
    // a response without a pass defaults to the first pass ("self")
    const selfOnly = definition.items.map((i) => ({ item_id: i.item_id, value: 0 }));
    expect(() => score(selfOnly)).toThrow(IncompleteResponsesError);
  });

  it("deriveMetrics: desired_change mirrors the self pass, perceived_partner_wants the partner_wants pass", () => {
    // self: +3 on acq_1, -2 on acq_2; partner_wants: -1 on acq_1, +2 on acq_3; everything else 0
    const rs = fullResponses("acq", (item, pass) => {
      if (pass === "self" && item.item_id === "acq_1") return 3;
      if (pass === "self" && item.item_id === "acq_2") return -2;
      if (pass === "partner_wants" && item.item_id === "acq_1") return -1;
      if (pass === "partner_wants" && item.item_id === "acq_3") return 2;
      return 0;
    });
    const d = deriveMetrics(definition, rs);
    // 34 items x (value:self, value:partner_wants, desired_change, perceived_partner_wants)
    expect(d).toHaveLength(136);
    expect(d.every((m) => m.instrument_key === "acq" && m.unvalidated === undefined)).toBe(true);
    const desired = metricMap(d, "desired_change");
    const perceived = metricMap(d, "perceived_partner_wants");
    expect(desired.get("acq_1")).toBe(3);
    expect(desired.get("acq_2")).toBe(-2);
    expect(desired.get("acq_3")).toBe(0);
    expect(perceived.get("acq_1")).toBe(-1);
    expect(perceived.get("acq_2")).toBe(0);
    expect(perceived.get("acq_3")).toBe(2);
    expect(metricMap(d, "value:self").get("acq_1")).toBe(3);
    expect(metricMap(d, "value:partner_wants").get("acq_3")).toBe(2);
    expect(metricMap(d, "gap").size).toBe(0);
  });

  it("deriveMetrics on a partial set yields partial metrics without throwing", () => {
    const d = deriveMetrics(definition, [{ item_id: "acq_5", value: 2, pass: "self" }]);
    expect(d).toEqual([
      { instrument_key: "acq", metric: "value:self", item_id: "acq_5", value: 2 },
      { instrument_key: "acq", metric: "desired_change", item_id: "acq_5", value: 2 },
    ]);
  });

  it("(e) InvalidResponseError outside -3..3, on a non-integer, and on an unknown pass", () => {
    const base = constantResponses("acq", 0);
    expect(() => score(setItem(base, "acq_1", 4, "self"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "acq_1", -4, "partner_wants"))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "acq_1", 0.5, "self"))).toThrow(InvalidResponseError);
    expect(() => deriveMetrics(definition, [{ item_id: "acq_1", value: 0, pass: "other" }])).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "acq_1", 3, "self"))).not.toThrow();
    expect(() => score(setItem(base, "acq_1", -3, "self"))).not.toThrow();
  });
});
