/**
 * Brief assembly (section 7). Builds the summarizer input for one domain from both partners'
 * color-layer material, honouring consent: written answers are passed to the model for
 * summarization in its own words; only answers marked shareable_verbatim (and only when the
 * author's couple-level share_written_answers_verbatim is on) are marked quotable. Consistency
 * notes (answers to probes) are included only when the author marked them shareable.
 */
import type { Domain } from "@/instruments/schema";
import type { Flag, PerceptionGap } from "@/lib/interpretation/stage1";
import type { BriefDomain, InterpreterOutput } from "@/lib/llm/schemas";

export type BriefAnswer = {
  answer_id: string;
  step: string;
  question_id: string;
  question_text: string;
  answer_text: string | null;
  skipped: boolean;
  shareable_verbatim: boolean;
};

export type BriefTag = { item_ref: string; descriptor: string; tag: "requirement" | "preference"; comment: string };

export type SummarizerInput = {
  domain: Domain;
  answers_a: BriefAnswer[];
  answers_b: BriefAnswer[];
  tags_a: BriefTag[];
  tags_b: BriefTag[];
  perception_gaps: Array<{ item_ref: string; descriptor: string; a_self: number | null; b_about_a: number | null; a_explanation: string | null; b_explanation: string | null }>;
  polarization_loops: Array<{ dimension: string; descriptor: string; a_gap: number; b_gap: number; unvalidated: true }>;
  consistency_notes: Array<{ user: "a" | "b"; note: string; share: boolean }>;
  aligned_items: string[];
  parked_items: string[];
};

type SideMaterial = {
  answers: Array<{ id: string; step: string; question_id: string; question_text: string; answer_text: string | null; skipped: boolean; shareable_verbatim: boolean; item_ref: string | null }>;
  tags: Array<{ item_ref: string; tag: "requirement" | "preference"; comment: string }>;
  consent: { share_written_answers_verbatim: boolean };
};

export function buildSummarizerInput(input: {
  domain: Domain;
  a: SideMaterial;
  b: SideMaterial;
  flags: Flag[];
  perceptionGaps: { a: PerceptionGap[]; b: PerceptionGap[] };
  interpretation: InterpreterOutput | null;
  descriptors: Record<string, string>;
}): SummarizerInput {
  const toAnswers = (m: SideMaterial): BriefAnswer[] =>
    m.answers
      .filter((a) => a.step !== "tag")
      .map((a) => ({
        answer_id: a.id,
        step: a.step,
        question_id: a.question_id,
        question_text: a.question_text,
        answer_text: a.answer_text,
        skipped: a.skipped,
        shareable_verbatim: m.consent.share_written_answers_verbatim && a.shareable_verbatim,
      }));
  const toTags = (m: SideMaterial): BriefTag[] => m.tags.map((t) => ({ item_ref: t.item_ref, descriptor: input.descriptors[t.item_ref] ?? t.item_ref, tag: t.tag, comment: t.comment }));

  const explanation = (m: SideMaterial, itemRef: string) => {
    const a = m.answers.find((x) => x.step === "perception_gap" && x.item_ref === itemRef && !x.skipped);
    return a?.answer_text ?? null;
  };
  const gapRefs = new Set([...input.perceptionGaps.a, ...input.perceptionGaps.b].filter((g) => g.domain === input.domain).map((g) => g.item_ref));
  const perception_gaps = [...gapRefs].map((ref) => {
    const ga = input.perceptionGaps.a.find((g) => g.item_ref === ref);
    return {
      item_ref: ref,
      descriptor: input.descriptors[ref] ?? ref,
      a_self: ga?.self_value ?? null,
      b_about_a: ga?.partner_value ?? null,
      a_explanation: explanation(input.a, ref),
      b_explanation: explanation(input.b, ref),
    };
  });

  const polarization_loops = input.flags
    .filter((f) => f.rule_key === "polarization_loop" && f.domain === input.domain && f.triggered_by.item)
    .map((f) => ({
      dimension: f.triggered_by.item!,
      descriptor: input.descriptors[f.triggered_by.item!] ?? f.triggered_by.item!,
      a_gap: Number(f.triggered_by.values.a_gap),
      b_gap: Number(f.triggered_by.values.b_gap),
      unvalidated: true as const,
    }));

  const notes = (side: "a" | "b", m: SideMaterial) =>
    m.answers
      .filter((x) => x.step === "consistency" && !x.skipped && x.answer_text)
      .map((x) => ({ user: side, note: x.answer_text!, share: m.consent.share_written_answers_verbatim && x.shareable_verbatim }));

  const domainInterp = input.interpretation?.domains.find((d) => d.domain === input.domain);
  const aligned_items = domainInterp?.aligned.map((x) => x.item) ?? [];
  // Parked: flagged items in this domain that neither partner wrote about.
  const written = new Set([...input.a.answers, ...input.b.answers].filter((x) => !x.skipped && x.item_ref).map((x) => x.item_ref!));
  const parked_items = [...new Set(input.flags.filter((f) => f.domain === input.domain && f.triggered_by.item && !written.has(f.triggered_by.item)).map((f) => input.descriptors[f.triggered_by.item!] ?? f.triggered_by.item!))];

  return {
    domain: input.domain,
    answers_a: toAnswers(input.a),
    answers_b: toAnswers(input.b),
    tags_a: toTags(input.a),
    tags_b: toTags(input.b),
    perception_gaps,
    polarization_loops,
    consistency_notes: [...notes("a", input.a), ...notes("b", input.b)],
    aligned_items,
    parked_items,
  };
}

/** Brief screen order: aligned first, then parked, then flagged domains in weight order. */
export function orderBriefs(briefs: BriefDomain[], domainWeights: Array<{ domain: Domain; weight: number }>): BriefDomain[] {
  const w = new Map(domainWeights.map((d) => [d.domain, d.weight]));
  return [...briefs].sort((x, y) => (w.get(y.domain) ?? 0) - (w.get(x.domain) ?? 0));
}
