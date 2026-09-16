/**
 * CPQ-SF (Futris et al. 2010), 1–9 scale. Per config/instruments/cpq_sf.json:
 *   constructive_communication  = sum_reverse_aware of 1, 2R, 3R, 4, 5, 6R, 11 (7 items, 3 reverse)  7–63
 *   self_demand_partner_withdraw = sum of 7, 9                                                        2–18
 *   partner_demand_self_withdraw = sum of 8, 10                                                       2–18
 * Reverse scoring is 1 + 9 - value = 10 - value.
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/cpq_sf";
import { constantResponses, fullResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

describe("cpq_sf", () => {
  it("definition matches the key these tests are derived from", () => {
    expect(definition.items).toHaveLength(11);
    expect(definition.items.filter((i) => i.reverse_scored).map((i) => i.item_id)).toEqual(["cpq_sf_2", "cpq_sf_3", "cpq_sf_6"]);
    expect(definition.scoring.subscales).toEqual([
      { name: "constructive_communication", method: "sum_reverse_aware", items: ["cpq_sf_1", "cpq_sf_2", "cpq_sf_3", "cpq_sf_4", "cpq_sf_5", "cpq_sf_6", "cpq_sf_11"] },
      { name: "self_demand_partner_withdraw", method: "sum", items: ["cpq_sf_7", "cpq_sf_9"] },
      { name: "partner_demand_self_withdraw", method: "sum", items: ["cpq_sf_8", "cpq_sf_10"] },
    ]);
  });

  it("(a) max: 9 on keyed items and 1 on reverse items -> constructive 63; demand subscales 18", () => {
    const rs = fullResponses("cpq_sf", (item, _pass, scale) => (item.reverse_scored ? scale.min : scale.max));
    const m = scoreMap(score(rs));
    expect(m.constructive_communication.value).toBe(63);
    expect(m.self_demand_partner_withdraw.value).toBe(18);
    expect(m.partner_demand_self_withdraw.value).toBe(18);
    for (const s of Object.values(m)) expect(s.cutoff_label).toBeNull();
  });

  it("(a') raw 9 everywhere: constructive 4*9 + 3*(10-9) = 39", () => {
    expect(scoreMap(score(constantResponses("cpq_sf", 9))).constructive_communication.value).toBe(39);
  });

  it("(b) min: 1 on keyed items and 9 on reverse items -> constructive 7; demand subscales 2", () => {
    const rs = fullResponses("cpq_sf", (item, _pass, scale) => (item.reverse_scored ? scale.max : scale.min));
    const m = scoreMap(score(rs));
    expect(m.constructive_communication.value).toBe(7);
    expect(m.self_demand_partner_withdraw.value).toBe(2);
    expect(m.partner_demand_self_withdraw.value).toBe(2);
  });

  it("(c) hand-worked: items [1,2,3,4,5,6,11] raw [5,3,7,6,4,2,8] score [5,7,3,6,4,8,8] = 41", () => {
    const rs = responsesFrom("cpq_sf", {
      cpq_sf_1: 5, cpq_sf_2: 3, cpq_sf_3: 7, cpq_sf_4: 6, cpq_sf_5: 4, cpq_sf_6: 2, cpq_sf_11: 8,
      cpq_sf_7: 6, cpq_sf_9: 3, // self demand 9
      cpq_sf_8: 2, cpq_sf_10: 7, // partner demand 9
    });
    const m = scoreMap(score(rs));
    expect(m.constructive_communication.value).toBe(41);
    expect(m.self_demand_partner_withdraw.value).toBe(9);
    expect(m.partner_demand_self_withdraw.value).toBe(9);
  });

  it("(d) raising a reverse item lowers constructive communication; raising a keyed item raises it", () => {
    const base = constantResponses("cpq_sf", 5); // each constructive item scores 5 -> 35
    expect(scoreMap(score(base)).constructive_communication.value).toBe(35);
    expect(scoreMap(score(setItem(base, "cpq_sf_2", 9))).constructive_communication.value).toBe(31); // 10 - 9 = 1
    expect(scoreMap(score(setItem(base, "cpq_sf_1", 9))).constructive_communication.value).toBe(39);
    // demand items are not reverse scored and do not touch the constructive subscale
    const m = scoreMap(score(setItem(base, "cpq_sf_7", 9)));
    expect(m.self_demand_partner_withdraw.value).toBe(14);
    expect(m.constructive_communication.value).toBe(35);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = constantResponses("cpq_sf", 5);
    expect(() => score(withoutItem(base, "cpq_sf_11"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "cpq_sf_1", 10))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "cpq_sf_1", 0))).toThrow(InvalidResponseError);
  });
});
