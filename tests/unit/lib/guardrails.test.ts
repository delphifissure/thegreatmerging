/**
 * lib/guardrails: the deterministic pattern filter (config/prohibited_language.json), the
 * polarization "unvalidated" rule, string collection over JSON, and the composed checkOutput
 * with an injected model check.
 */
import { describe, expect, it, vi } from "vitest";
import {
  checkOutput,
  checkOutputDeterministic,
  checkTextDeterministic,
  collectStrings,
  formatViolations,
  type Violation,
} from "@/lib/guardrails";

const categoriesOf = (text: string) => checkTextDeterministic(text).map((v) => v.category);

describe("checkTextDeterministic: sentences that must be caught", () => {
  const mustCatch: Array<[text: string, category: Violation["category"]]> = [
    ["You two should break up", "relationship_verdict"],
    ["this relationship is doomed", "relationship_verdict"],
    ["you are fundamentally incompatible", "relationship_verdict"],
    ["the two of you seem like a good match", "relationship_verdict"],
    ["it's time to move on", "relationship_verdict"],
    ["she has borderline personality disorder", "diagnosis"],
    ["he is clinically depressed", "diagnosis"],
    ["your partner is very controlling", "trait_label"],
    ["you are avoidant", "trait_label"],
    ["he is an introvert", "trait_label"],
    ["your attachment style is anxious", "trait_label"],
    ["you deserve better than him", "worth"],
    ["this is a red flag", "relationship_verdict"],
  ];

  it.each(mustCatch)("%j produces a %s violation", (text, category) => {
    const violations = checkTextDeterministic(text);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.category)).toContain(category);
  });

  it("is case-insensitive and records the matched span and the source pattern", () => {
    const [v] = checkTextDeterministic("YOU ARE AVOIDANT");
    expect(v.category).toBe("trait_label");
    expect(v.match.toLowerCase()).toBe("you are avoidant");
    expect(v.pattern.length).toBeGreaterThan(0);
  });

  it("carries the path it was given on every violation", () => {
    const violations = checkTextDeterministic("this is a red flag and you are the problem", "$.domains[0].flagged[1].plain_reason");
    expect(violations.length).toBeGreaterThanOrEqual(2);
    for (const v of violations) expect(v.path).toBe("$.domains[0].flagged[1].plain_reason");
  });

  it("a diagnosis embedded in an otherwise neutral sentence is still caught", () => {
    expect(categoriesOf("Given the scores, it seems he suffers from generalized anxiety these days.")).toContain("diagnosis");
  });

  it("a worth statement about the partner is caught", () => {
    expect(categoriesOf("Your partner is not good enough for you.")).toContain("worth");
  });

  it("'deal-breaker' counts as a relationship verdict", () => {
    expect(categoriesOf("For many people that is a deal-breaker.")).toContain("relationship_verdict");
  });
});

describe("checkTextDeterministic: sentences that must pass", () => {
  const mustPass = [
    "Your ECR-R anxiety score is 3.1, in the moderate range.",
    "The PHQ-9 total is 12, in the moderate range; screener result, clinical evaluation required.",
    "You rated the chores item +2 and your partner rated it 0.",
    "The polarization block (unvalidated) shows a gap of 3 on planning.",
    "Attachment avoidance is context that explains patterns.",
    "What would change your mind?",
  ];

  it.each(mustPass)("%j produces no violation", (text) => {
    expect(checkTextDeterministic(text)).toEqual([]);
  });

  it("returns nothing for empty text", () => {
    expect(checkTextDeterministic("")).toEqual([]);
  });

  it("allowlisted instrument phrases are stripped before scanning", () => {
    expect(checkTextDeterministic("Attachment anxiety is 4.2 on the ECR-R anxiety subscale; this is not a diagnosis.")).toEqual([]);
    expect(checkTextDeterministic("The GAD-7 and PHQ-9 are screeners; no diagnosis is made here.")).toEqual([]);
  });

  it("naming a gap, an item or a domain is not a verdict", () => {
    expect(checkTextDeterministic("On planning meals you answered 2 and your partner answered 7; the gap is 5.")).toEqual([]);
    expect(checkTextDeterministic("Household flagged with weight 5 on two items.")).toEqual([]);
  });
});

describe("the polarization block must carry the unvalidated label", () => {
  it("'polarization' without 'unvalidated' is an unvalidated_label violation", () => {
    const v = checkTextDeterministic("The polarization block shows a loop on order in the home.");
    expect(v).toEqual([
      expect.objectContaining({ category: "unvalidated_label", match: "polarization", pattern: "polarization without unvalidated label" }),
    ]);
  });

  it("'polarization' with 'unvalidated' anywhere in the same text passes", () => {
    expect(checkTextDeterministic("The polarization block (unvalidated) shows a loop on order in the home.")).toEqual([]);
    expect(checkTextDeterministic("Unvalidated: the polarization block shows a loop.")).toEqual([]);
  });

  it("the British spelling is covered too", () => {
    expect(categoriesOf("The polarisation block shows a loop.")).toEqual(["unvalidated_label"]);
  });
});

describe("collectStrings", () => {
  it("returns every string leaf with a JSON-path style path", () => {
    const value = { a: "x", b: [1, "y", { c: "z", d: null, e: undefined }], f: 2, g: true };
    expect(collectStrings(value)).toEqual([
      { path: "$.a", text: "x" },
      { path: "$.b[1]", text: "y" },
      { path: "$.b[2].c", text: "z" },
    ]);
  });

  it("handles a bare string, an empty object and non-string scalars", () => {
    expect(collectStrings("hello")).toEqual([{ path: "$", text: "hello" }]);
    expect(collectStrings({})).toEqual([]);
    expect(collectStrings(42)).toEqual([]);
    expect(collectStrings(null)).toEqual([]);
  });
});

describe("checkOutputDeterministic", () => {
  it("ok when no string leaf violates", () => {
    const res = checkOutputDeterministic({ domains: [{ aligned: [{ item: "acq_1", one_sentence: "You both said no change on chores." }] }] });
    expect(res).toEqual({ ok: true, violations: [] });
  });

  it("reports the path of the offending leaf", () => {
    const res = checkOutputDeterministic({ domains: [{ flagged: [{ plain_reason: "This is a red flag." }] }] });
    expect(res.ok).toBe(false);
    expect(res.violations).toEqual([expect.objectContaining({ category: "relationship_verdict", path: "$.domains[0].flagged[0].plain_reason" })]);
  });

  it("skipPaths excludes matching paths from the scan", () => {
    const output = { probes: [{ question_text: "What's the value under this?", references: ["you are avoidant"] }] };
    expect(checkOutputDeterministic(output).ok).toBe(false);
    expect(checkOutputDeterministic(output, { skipPaths: /\.references\[/ })).toEqual({ ok: true, violations: [] });
  });
});

describe("checkOutput (deterministic filter plus model check)", () => {
  const clean = { note: "You rated chores +2 and your partner rated it 0.", other: "What would change your mind?" };

  it("model check returning true fails with category model and the reason as the match", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: true, reason: "implies the couple should separate" }));
    const res = await checkOutput(clean, { reachesPerson: true, modelCheck });
    expect(res.ok).toBe(false);
    expect(res.violations).toEqual([{ category: "model", pattern: "guardrail model check", match: "implies the couple should separate" }]);
    expect(modelCheck).toHaveBeenCalledTimes(1);
  });

  it("model check returning false leaves the output ok", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: false, reason: "none found" }));
    const res = await checkOutput(clean, { reachesPerson: true, modelCheck });
    expect(res).toEqual({ ok: true, violations: [] });
    expect(modelCheck).toHaveBeenCalledTimes(1);
  });

  it("the model check receives every non-empty string joined by newlines", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: false, reason: "none found" }));
    await checkOutput({ a: " first ", b: ["", "second"], c: { d: "third" } }, { reachesPerson: true, modelCheck });
    expect(modelCheck).toHaveBeenCalledWith("first\nsecond\nthird");
  });

  it("the model check is not called when the deterministic check already failed", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: false, reason: "none found" }));
    const res = await checkOutput({ text: "You two should break up." }, { reachesPerson: true, modelCheck });
    expect(res.ok).toBe(false);
    expect(res.violations[0].category).toBe("relationship_verdict");
    expect(modelCheck).not.toHaveBeenCalled();
  });

  it("the model check is not called when the text does not reach a person", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: true, reason: "would fail" }));
    const res = await checkOutput(clean, { reachesPerson: false, modelCheck });
    expect(res).toEqual({ ok: true, violations: [] });
    expect(modelCheck).not.toHaveBeenCalled();
  });

  it("the model check is not called when there is no person-facing text", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: true, reason: "would fail" }));
    const res = await checkOutput({ concrete: true, n: 3, empty: "   " }, { reachesPerson: true, modelCheck });
    expect(res.ok).toBe(true);
    expect(modelCheck).not.toHaveBeenCalled();
  });

  it("skipPaths are honoured by both the deterministic scan and the model check input", async () => {
    const modelCheck = vi.fn(async () => ({ contains_verdict_or_diagnosis: false, reason: "none found" }));
    const output = { probes: [{ question_text: "What's the value under this?", references: ["this is a red flag"] }] };
    const res = await checkOutput(output, { reachesPerson: true, modelCheck, skipPaths: /\.references\[/ });
    expect(res.ok).toBe(true);
    expect(modelCheck).toHaveBeenCalledWith("What's the value under this?");
  });

  it("without a modelCheck only the deterministic result is returned", async () => {
    expect(await checkOutput(clean, { reachesPerson: true })).toEqual({ ok: true, violations: [] });
  });
});

describe("formatViolations", () => {
  it("renders category, path and match", () => {
    const text = formatViolations([
      { category: "trait_label", pattern: "p", match: "you are avoidant", path: "$.x" },
      { category: "model", pattern: "guardrail model check", match: "reason" },
    ]);
    expect(text).toBe('trait_label at $.x: "you are avoidant"; model: "reason"');
  });
});
