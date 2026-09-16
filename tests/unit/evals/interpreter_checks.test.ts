/**
 * The interpreter eval checks, exercised on the sentence shapes Claude Sonnet 5 produced in the
 * first real batch (2026-09-16). Those runs failed 16 of 20 couples on checker false positives
 * ("PHQ-9" read as a leaked 9; a consenting partner's own 0 matching the masked partner's 0) and
 * on a prompt that invited "your score is masked" placeholder sentences.
 */
import { describe, expect, it } from "vitest";
import { interpreterFindings, interpreterProblems, stripInstrumentNames } from "@/evals/interpreter_checks";
import type { InterpreterOutput } from "@/lib/llm/schemas";
import type { MaskedScore } from "@/lib/interpretation/stage2";

const phq = (value: number | "masked"): MaskedScore => ({ instrument_key: "phq9", subscale: "total", value, cutoff_label: value === "masked" ? "masked" : "minimal" });
const gad = (value: number | "masked"): MaskedScore => ({ instrument_key: "gad7", subscale: "total", value, cutoff_label: value === "masked" ? "masked" : "minimal" });

function output(overrides: Partial<InterpreterOutput> & { a?: InterpreterOutput["private_summaries"][number]["sentences"]; b?: InterpreterOutput["private_summaries"][number]["sentences"] } = {}): InterpreterOutput {
  return {
    distress_note: overrides.distress_note ?? null,
    domains: overrides.domains ?? [],
    private_summaries: [
      { user: "a", sentences: overrides.a ?? [{ instrument_key: "csi16", sentence: "Your relationship satisfaction total is 70, above the published cutoff." }] },
      { user: "b", sentences: overrides.b ?? [{ instrument_key: "csi16", sentence: "Your relationship satisfaction total is 64, above the published cutoff." }] },
    ],
  };
}

describe("stripInstrumentNames", () => {
  it("removes the digits that belong to instrument names", () => {
    expect(stripInstrumentNames("Depression symptom total (PHQ-9) and GAD-7 and OCI-R")).toBe("Depression symptom total (PHQ) and GAD and OCI");
    expect(stripInstrumentNames("PHQ9 total 12")).toBe("PHQ total 12");
  });
});

describe("interpreterProblems", () => {
  it("passes a clean output where only non-mental-health sentences are written", () => {
    const problems = interpreterProblems({ output: output(), input: { flags_by_domain: {}, scores_a: [phq("masked")], scores_b: [phq("masked")] }, maskedSides: ["a", "b"], maskedNumbers: [9, 4] });
    expect(problems).toEqual([]);
  });

  it("fails a placeholder mental-health sentence for a masked user and the mention of masking", () => {
    const problems = interpreterProblems({
      output: output({ a: [{ instrument_key: "phq9", sentence: "Your depression symptom score is masked and not shown here." }] }),
      input: { flags_by_domain: {}, scores_a: [phq("masked")], scores_b: [phq(3)] },
      maskedSides: ["a"],
      maskedNumbers: [5],
    });
    expect(problems).toContain("mental-health sentence for masked user a");
    expect(problems.some((p) => p.startsWith("mentions masking"))).toBe(true);
  });

  it("does not read the 9 in PHQ-9 as a leaked masked 9", () => {
    const problems = interpreterProblems({
      output: output({ domains: [{ domain: "self_care", aligned: [{ item: "phq9:total", one_sentence: "The PHQ-9 is read as context only." }], low_intensity_misaligned: [], flagged: [] }] }),
      input: { flags_by_domain: {}, scores_a: [phq("masked")], scores_b: [phq("masked")] },
      maskedSides: ["a", "b"],
      maskedNumbers: [9],
    });
    expect(problems.filter((p) => p.startsWith("masked value"))).toEqual([]);
  });

  it("does not count a consenting partner's own value that happens to equal the masked value", () => {
    const problems = interpreterProblems({
      output: output({ distress_note: null, domains: [{ domain: "self_care", aligned: [], low_intensity_misaligned: [], flagged: [] }] }),
      input: { flags_by_domain: {}, scores_a: [phq(0), gad(0)], scores_b: [phq("masked"), gad("masked")] },
      maskedSides: ["b"],
      maskedNumbers: [0, 0],
    });
    expect(problems).toEqual([]);
    // The same text with a value the model was never given is a leak.
    const leak = interpreterProblems({
      output: output({ distress_note: "Partner B's anxiety total (GAD-7) is 14, so these scores are read under distress." }),
      input: { flags_by_domain: {}, scores_a: [phq(0), gad(0)], scores_b: [phq("masked"), gad("masked")] },
      maskedSides: ["b"],
      maskedNumbers: [14],
    });
    expect(leak).toContain("masked value 14 surfaced");
  });

  it("records a model-written mental-health sentence for a consenting user as a warning, not a failure", () => {
    const findings = interpreterFindings({
      output: output({ a: [{ instrument_key: "gad7", sentence: "Anxiety symptom total (GAD-7) scored 0, in the minimal range." }] }),
      input: { flags_by_domain: {}, scores_a: [gad(0)], scores_b: [gad("masked")] },
      maskedSides: ["b"],
      maskedNumbers: [0],
    });
    expect(findings.problems).toEqual([]);
    expect(findings.warnings).toEqual(["mental-health sentence for user a (discarded; code writes these)"]);
  });

  it("requires the unvalidated label on every polarization reference", () => {
    const problems = interpreterProblems({
      output: output({ distress_note: "The polarization block shows a loop." }),
      input: { flags_by_domain: {}, scores_a: [], scores_b: [] },
      maskedSides: [],
      maskedNumbers: [],
    });
    expect(problems.some((p) => p.startsWith("polarization without unvalidated"))).toBe(true);
  });
});
