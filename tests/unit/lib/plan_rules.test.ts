/**
 * lib/plan/rules: pinning of shared requirements, save and close validation, the parenting lines,
 * and the version-to-version diff.
 */
import { describe, expect, it } from "vitest";
import type { ParentingLines, PlanItem } from "@/lib/data/brief_plan";
import { diffPlans, isMismatch, isSharedRequirement, normalizeItems, PARENTING_LINES, validateForClose, validateForSave } from "@/lib/plan/rules";

function item(patch: Partial<PlanItem> & { topic: string }): PlanItem {
  return {
    domain: "household",
    agreed: "We agreed.",
    a_does: "A does this.",
    b_does: "B does that.",
    revisit_date: null,
    status: "active",
    ...patch,
  };
}

const fullLines: ParentingLines = {
  children_questioning_adults: "Children may question adults respectfully.",
  who_corrects_and_how: "Whoever is present corrects, calmly.",
  structure_vs_freedom: "Structured mornings, open afternoons.",
  language_and_modeling_standard: "No swearing in front of the child.",
  adults_disagreeing_in_front_of_child: "Pause, then discuss after bedtime.",
};

describe("isSharedRequirement / isMismatch", () => {
  it("classify tag pairs", () => {
    expect(isSharedRequirement(item({ topic: "x", a_tag: "requirement", b_tag: "requirement" }))).toBe(true);
    expect(isSharedRequirement(item({ topic: "x", a_tag: "requirement", b_tag: "preference" }))).toBe(false);
    expect(isMismatch(item({ topic: "x", a_tag: "requirement", b_tag: "preference" }))).toBe(true);
    expect(isMismatch(item({ topic: "x", a_tag: "preference", b_tag: "requirement" }))).toBe(true);
    expect(isMismatch(item({ topic: "x", a_tag: "preference", b_tag: "preference" }))).toBe(false);
    expect(isMismatch(item({ topic: "x" }))).toBe(false);
  });
});

describe("normalizeItems", () => {
  it("pins shared requirements with a null date and orders pinned, active, parked, closed (stable)", () => {
    const items: PlanItem[] = [
      item({ topic: "closed one", status: "closed" }),
      item({ topic: "parked one", status: "parked" }),
      item({ topic: "active one", status: "active" }),
      item({ topic: "shared req", a_tag: "requirement", b_tag: "requirement", revisit_date: "2030-01-01", status: "parked" }),
      item({ topic: "active two", status: "active", revisit_date: "2030-02-02" }),
      item({ topic: "shared req two", a_tag: "requirement", b_tag: "requirement" }),
    ];
    const out = normalizeItems(items);
    expect(out.map((i) => i.topic)).toEqual(["shared req", "shared req two", "active one", "active two", "parked one", "closed one"]);
    expect(out[0]).toMatchObject({ pinned: true, revisit_date: null });
    expect(out[1]).toMatchObject({ pinned: true, revisit_date: null });
    for (const it of out.slice(2)) expect(it.pinned).toBe(false);
    expect(out[3].revisit_date).toBe("2030-02-02");
    // Input is not mutated.
    expect(items[3].revisit_date).toBe("2030-01-01");
    expect(items[3].pinned).toBeUndefined();
  });

  it("clears a stale pinned flag on items that are no longer shared requirements", () => {
    const out = normalizeItems([item({ topic: "was pinned", pinned: true, a_tag: "requirement", b_tag: "preference", revisit_date: "2030-01-01" })]);
    expect(out[0].pinned).toBe(false);
  });
});

describe("validateForSave", () => {
  it("returns no issues for a clean plan", () => {
    expect(
      validateForSave([
        item({ topic: "Dishes", a_tag: "requirement", b_tag: "requirement" }),
        item({ topic: "Laundry", a_tag: "requirement", b_tag: "preference", revisit_date: "2030-03-01" }),
        item({ topic: "Guests", status: "parked" }),
      ]),
    ).toEqual([]);
  });

  it("flags a requirement/preference mismatch without a date", () => {
    const issues = validateForSave([item({ topic: "Laundry", a_tag: "preference", b_tag: "requirement" })]);
    expect(issues).toEqual([{ index: 0, field: "revisit_date", message: expect.stringMatching(/needs a revisit date/) }]);
  });

  it("does not require a date on a mismatch that is parked or closed", () => {
    expect(validateForSave([item({ topic: "Laundry", a_tag: "preference", b_tag: "requirement", status: "parked" })])).toEqual([]);
    expect(validateForSave([item({ topic: "Laundry", a_tag: "preference", b_tag: "requirement", status: "closed" })])).toEqual([]);
  });

  it("flags a shared requirement that carries a date", () => {
    const issues = validateForSave([item({ topic: "Dishes", a_tag: "requirement", b_tag: "requirement", revisit_date: "2030-01-01" })]);
    expect(issues).toEqual([{ index: 0, field: "revisit_date", message: expect.stringMatching(/does not take a revisit date/) }]);
  });

  it("flags a badly formatted date", () => {
    const issues = validateForSave([item({ topic: "Dishes", revisit_date: "01/02/2030" })]);
    expect(issues).toEqual([{ index: 0, field: "revisit_date", message: "Use a date in YYYY-MM-DD form." }]);
    expect(validateForSave([item({ topic: "Dishes", revisit_date: "2030-1-2" })])).toHaveLength(1);
  });

  it("flags an empty or whitespace topic with the right index", () => {
    const issues = validateForSave([item({ topic: "Fine" }), item({ topic: "   " })]);
    expect(issues).toEqual([{ index: 1, field: "topic", message: "Every item needs a topic." }]);
  });

  it("reports several issues on one item", () => {
    const issues = validateForSave([item({ topic: "", a_tag: "requirement", b_tag: "preference", revisit_date: "bad" })]);
    expect(issues.map((i) => i.field)).toEqual(["topic", "revisit_date"]);
  });
});

describe("validateForClose", () => {
  it("adds the five parenting lines for the parenting domain when they are missing", () => {
    const issues = validateForClose([], "parenting", null);
    expect(issues).toHaveLength(5);
    expect(issues.map((i) => i.field)).toEqual(PARENTING_LINES.map((l) => l.key));
    expect(issues.map((i) => i.index)).toEqual([null, null, null, null, null]);
    for (const [i, line] of PARENTING_LINES.entries()) expect(issues[i].message).toContain(line.label);
  });

  it("names exactly the blank parenting lines", () => {
    const issues = validateForClose([], "parenting", { ...fullLines, who_corrects_and_how: "   " });
    expect(issues).toEqual([{ index: null, field: "who_corrects_and_how", message: "The parenting plan needs a line for: Who corrects and how." }]);
    expect(validateForClose([], "parenting", fullLines)).toEqual([]);
  });

  it("adds nothing for the household domain", () => {
    expect(validateForClose([item({ topic: "Dishes" })], "household", null)).toEqual([]);
  });

  it("blocks closing while a requirement-versus-preference item in this domain has no date, even if parked", () => {
    const items = [item({ topic: "Laundry", a_tag: "requirement", b_tag: "preference", status: "parked" })];
    const issues = validateForClose(items, "household", null);
    expect(issues).toEqual([{ index: 0, field: "revisit_date", message: expect.stringMatching(/cannot close/) }]);
    expect(validateForClose([{ ...items[0], status: "closed" }], "household", null)).toEqual([]);
    expect(validateForClose([{ ...items[0], revisit_date: "2030-05-05" }], "household", null)).toEqual([]);
  });

  it("ignores items from other domains", () => {
    const items = [item({ topic: "Laundry", domain: "communication", a_tag: "requirement", b_tag: "preference" })];
    expect(validateForClose(items, "household", null)).toEqual([]);
  });

  it("the five lines are the documented ones", () => {
    expect(PARENTING_LINES.map((l) => l.key)).toEqual([
      "children_questioning_adults",
      "who_corrects_and_how",
      "structure_vs_freedom",
      "language_and_modeling_standard",
      "adults_disagreeing_in_front_of_child",
    ]);
  });
});

describe("diffPlans", () => {
  const prev: PlanItem[] = [
    item({ topic: "Dishes", agreed: "Alternate days." }),
    item({ topic: "Laundry", revisit_date: "2030-01-01" }),
    item({ topic: "Guests", item_ref: "household_t3", agreed: "Ask first." }),
  ];

  it("reports added, removed and changed items with the changed fields", () => {
    const next: PlanItem[] = [
      item({ topic: "dishes ", agreed: "Alternate weeks.", status: "parked" }),
      item({ topic: "Guests", item_ref: "household_t3", agreed: "Ask first." }),
      item({ topic: "Cooking" }),
    ];
    const diff = diffPlans(prev, next);
    expect(diff).toEqual([
      {
        kind: "changed",
        index: 0,
        topic: "dishes ",
        fields: [
          { field: "topic", before: "Dishes", after: "dishes " },
          { field: "agreed", before: "Alternate days.", after: "Alternate weeks." },
          { field: "status", before: "active", after: "parked" },
        ],
      },
      { kind: "added", index: 2, topic: "Cooking" },
      { kind: "removed", index: 1, topic: "Laundry" },
    ]);
  });

  it("matches on item_ref when present, else on trimmed lower-cased topic within the domain", () => {
    const next: PlanItem[] = [item({ topic: "Guests, renamed", item_ref: "household_t3", agreed: "Ask first." }), item({ topic: "Dishes", agreed: "Alternate days.", domain: "communication" })];
    const diff = diffPlans(prev, next);
    expect(diff).toEqual([
      { kind: "changed", index: 0, topic: "Guests, renamed", fields: [{ field: "topic", before: "Guests", after: "Guests, renamed" }] },
      { kind: "added", index: 1, topic: "Dishes" },
      { kind: "removed", index: 0, topic: "Dishes" },
      { kind: "removed", index: 1, topic: "Laundry" },
    ]);
  });

  it("returns an empty diff for identical plans", () => {
    expect(diffPlans(prev, prev.map((p) => ({ ...p })))).toEqual([]);
  });

  it("treats a missing optional field and null as equal", () => {
    expect(diffPlans([item({ topic: "Dishes" })], [{ ...item({ topic: "Dishes" }), item_ref: undefined }])).toEqual([]);
  });
});
