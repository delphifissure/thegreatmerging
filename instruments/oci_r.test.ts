/**
 * OCI-R (Foa et al. 2002): 18 items scored 0–4, total 0–72 with a cutoff of 21.
 * Six 3-item subscales (each 0–12) per config:
 *   washing 5, 11, 17 | obsessing 6, 12, 18 | hoarding 1, 7, 13 | ordering 3, 9, 15 | checking 2, 8, 14 | neutralizing 4, 10, 16
 */
import { describe, expect, it } from "vitest";
import { IncompleteResponsesError, InvalidResponseError } from "@/instruments/define";
import { definition, score } from "@/instruments/oci_r";
import { maxResponses, minResponses, responsesFrom, scoreMap, setItem, withoutItem } from "@/tests/unit/helpers/responses";

const SUBSCALES = ["washing", "obsessing", "hoarding", "ordering", "checking", "neutralizing"];

describe("oci_r", () => {
  it("definition matches the published key", () => {
    expect(definition.mental_health).toBe(true);
    expect(definition.items).toHaveLength(18);
    for (const item of definition.items) expect(item.scale).toMatchObject({ min: 0, max: 4 });
    expect(definition.scoring.subscales.map((s) => s.name)).toEqual(["total", ...SUBSCALES]);
    const sub = (n: string) => definition.scoring.subscales.find((s) => s.name === n)!.items;
    expect(sub("washing")).toEqual(["oci_r_5", "oci_r_11", "oci_r_17"]);
    expect(sub("obsessing")).toEqual(["oci_r_6", "oci_r_12", "oci_r_18"]);
    expect(sub("hoarding")).toEqual(["oci_r_1", "oci_r_7", "oci_r_13"]);
    expect(sub("ordering")).toEqual(["oci_r_3", "oci_r_9", "oci_r_15"]);
    expect(sub("checking")).toEqual(["oci_r_2", "oci_r_8", "oci_r_14"]);
    expect(sub("neutralizing")).toEqual(["oci_r_4", "oci_r_10", "oci_r_16"]);
  });

  it("(a) max: 4 everywhere -> total 72 at_or_above_cutoff, each subscale 12", () => {
    const m = scoreMap(score(maxResponses("oci_r")));
    expect(m.total).toMatchObject({ value: 72, cutoff_label: "at_or_above_cutoff" });
    for (const s of SUBSCALES) expect(m[s]).toMatchObject({ value: 12, cutoff_label: null });
  });

  it("(b) min: 0 everywhere -> total 0 below_cutoff", () => {
    const m = scoreMap(score(minResponses("oci_r")));
    expect(m.total).toMatchObject({ value: 0, cutoff_label: "below_cutoff" });
    for (const s of SUBSCALES) expect(m[s].value).toBe(0);
  });

  it("(c) cutoff: 20 -> below_cutoff, 21 -> at_or_above_cutoff", () => {
    // five items at 4 = 20
    const twenty = responsesFrom("oci_r", { oci_r_1: 4, oci_r_2: 4, oci_r_3: 4, oci_r_4: 4, oci_r_5: 4 }, 0);
    expect(scoreMap(score(twenty)).total).toMatchObject({ value: 20, cutoff_label: "below_cutoff" });
    expect(scoreMap(score(setItem(twenty, "oci_r_6", 1))).total).toMatchObject({ value: 21, cutoff_label: "at_or_above_cutoff" });
  });

  it("(c') hand-worked subscales: washing 4 + 3 + 2 = 9, everything else 0", () => {
    const m = scoreMap(score(responsesFrom("oci_r", { oci_r_5: 4, oci_r_11: 3, oci_r_17: 2 }, 0)));
    expect(m.washing.value).toBe(9);
    expect(m.total).toMatchObject({ value: 9, cutoff_label: "below_cutoff" });
    for (const s of SUBSCALES.filter((x) => x !== "washing")) expect(m[s].value).toBe(0);
  });

  it("(d) no reverse items: raising an item raises its subscale and the total by the same amount", () => {
    const m = scoreMap(score(setItem(minResponses("oci_r"), "oci_r_13", 3)));
    expect(m.hoarding.value).toBe(3);
    expect(m.total.value).toBe(3);
    expect(m.checking.value).toBe(0);
  });

  it("(e) throws IncompleteResponsesError on a partial set and InvalidResponseError out of range", () => {
    const base = minResponses("oci_r");
    expect(() => score(withoutItem(base, "oci_r_18"))).toThrow(IncompleteResponsesError);
    expect(() => score(setItem(base, "oci_r_1", 5))).toThrow(InvalidResponseError);
    expect(() => score(setItem(base, "oci_r_1", -1))).toThrow(InvalidResponseError);
  });
});
