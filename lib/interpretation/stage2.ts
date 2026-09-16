/**
 * Interpretation stage 2: build the interpreter input from stage 1 output with mental-health
 * values masked unless that person consented, and compute the aligned / low-intensity-misaligned
 * candidate lists in code so the model only phrases them.
 *
 * Prompts carry item IDs and descriptors, never item text (cost control 3). Per-person material
 * from the other partner is limited to what the couple-level interpretation needs.
 */
import { INSTRUMENTS, isMentalHealthKey, type InstrumentKey } from "@/instruments/registry";
import { metricMap } from "@/instruments/derived";
import type { Domain, Score } from "@/instruments/schema";
import type { Flag, Stage1Output } from "./stage1";
import type { InterpreterOutput } from "@/lib/llm/schemas";

export type MaskedScore = {
  instrument_key: string;
  subscale: string;
  value: number | "masked";
  cutoff_label: string | null | "masked";
  unvalidated?: boolean;
};

export type Candidate = { domain: Domain; item: string; descriptor: string; a: number; b: number };

export type InterpreterInput = {
  distress_context: boolean;
  scores_a: MaskedScore[];
  scores_b: MaskedScore[];
  couple_scores: Array<{ metric: string; value: number; details: unknown; unvalidated?: boolean }>;
  flags_by_domain: Record<string, Array<Pick<Flag, "rule_key" | "weight" | "label" | "triggered_by">>>;
  aligned_candidates: Candidate[];
  misaligned_candidates: Candidate[];
  unvalidated_instruments: string[];
};

export function maskScores(scores: Score[], shareMentalHealth: boolean): MaskedScore[] {
  return scores.map((s) => {
    const mental = isMentalHealthKey(s.instrument_key);
    if (mental && !shareMentalHealth) {
      return { instrument_key: s.instrument_key, subscale: s.subscale, value: "masked", cutoff_label: "masked" };
    }
    return { instrument_key: s.instrument_key, subscale: s.subscale, value: s.value, cutoff_label: s.cutoff_label, ...(s.unvalidated ? { unvalidated: true } : {}) };
  });
}

function domainOfItem(key: InstrumentKey, itemId: string): Domain {
  const def = INSTRUMENTS[key].definition;
  return def.items.find((i) => i.item_id === itemId)?.domain ?? def.default_domain ?? "communication";
}

/** Code-computed aligned and low-intensity-misaligned candidates from comparable items. */
export function computeCandidates(stage1: Stage1Output, input: { a: Record<string, Array<{ item_id: string; value: number; pass?: string }>>; b: typeof stage1 extends never ? never : Record<string, Array<{ item_id: string; value: number; pass?: string }>> }): {
  aligned: Candidate[];
  misaligned: Candidate[];
} {
  const flaggedItems = new Set(stage1.flags.filter((f) => f.triggered_by.item).map((f) => `${f.triggered_by.instrument}:${f.triggered_by.item}`));
  const aligned: Candidate[] = [];
  const misaligned: Candidate[] = [];
  const push = (list: Candidate[], key: InstrumentKey, itemId: string, a: number, b: number) => {
    if (flaggedItems.has(`${key}:${itemId}`)) return;
    list.push({ domain: domainOfItem(key, itemId), item: itemId, descriptor: INSTRUMENTS[key].definition.items.find((i) => i.item_id === itemId)?.descriptor ?? itemId, a, b });
  };
  const single = (key: InstrumentKey, side: "a" | "b") => new Map((input[side][key] ?? []).filter((r) => !r.pass || r.pass === INSTRUMENTS[key].definition.passes[0]).map((r) => [r.item_id, r.value]));

  // RDAS consensus: both at "almost always agree" or better → aligned; differ by 2+ → misaligned.
  {
    const a = single("rdas", "a");
    const b = single("rdas", "b");
    for (const id of INSTRUMENTS.rdas.definition.scoring.subscales.find((s) => s.name === "consensus")?.items ?? []) {
      const x = a.get(id);
      const y = b.get(id);
      if (x === undefined || y === undefined) continue;
      if (x >= 4 && y >= 4) push(aligned, "rdas", id, x, y);
      else if (Math.abs(x - y) >= 2) push(misaligned, "rdas", id, x, y);
    }
  }
  // ACQ: both want little change → aligned; opposite small pulls → misaligned.
  {
    const a = metricMap(stage1.derived.a.filter((d) => d.instrument_key === "acq"), "desired_change");
    const b = metricMap(stage1.derived.b.filter((d) => d.instrument_key === "acq"), "desired_change");
    for (const [id, x] of a) {
      const y = b.get(id);
      if (y === undefined) continue;
      if (x === 0 && y === 0) push(aligned, "acq", id, x, y);
      else if (Math.abs(x) <= 1 && Math.abs(y) <= 1 && x !== y) push(misaligned, "acq", id, x, y);
    }
  }
  // Who Does What: mirrored "now" ratings agree within 1 and both gaps ≤ 1 → aligned.
  {
    const cs = stage1.couple_scores.find((c) => c.metric === "wdw_now_disagreement");
    const items = (cs?.details.items ?? []) as Array<{ item_id: string; a_now: number; b_now_mirrored: number; disagreement: number }>;
    const gapA = metricMap(stage1.derived.a.filter((d) => d.instrument_key === "who_does_what"), "now_ideal_gap");
    const gapB = metricMap(stage1.derived.b.filter((d) => d.instrument_key === "who_does_what"), "now_ideal_gap");
    for (const it of items) {
      const ga = gapA.get(it.item_id) ?? 0;
      const gb = gapB.get(it.item_id) ?? 0;
      if (it.disagreement <= 1 && ga <= 1 && gb <= 1) push(aligned, "who_does_what", it.item_id, it.a_now, it.b_now_mirrored);
      else if (it.disagreement === 2 || ga === 2 || gb === 2) push(misaligned, "who_does_what", it.item_id, it.a_now, it.b_now_mirrored);
    }
  }
  // MAP: both intensity below the high threshold → aligned low-intensity area.
  {
    const ia = metricMap(stage1.derived.a.filter((d) => d.instrument_key === "map"), "value:intensity");
    const ib = metricMap(stage1.derived.b.filter((d) => d.instrument_key === "map"), "value:intensity");
    for (const [id, x] of ia) {
      const y = ib.get(id);
      if (y === undefined) continue;
      if (x < 25 && y < 25) push(aligned, "map", id, x, y);
      else if (Math.abs(x - y) >= 30) push(misaligned, "map", id, x, y);
    }
  }
  // FAPBI: both acceptability high → aligned.
  {
    const aa = metricMap(stage1.derived.a.filter((d) => d.instrument_key === "fapbi"), "value:acceptability");
    const ab = metricMap(stage1.derived.b.filter((d) => d.instrument_key === "fapbi"), "value:acceptability");
    for (const [id, x] of aa) {
      const y = ab.get(id);
      if (y === undefined) continue;
      if (x >= 7 && y >= 7) push(aligned, "fapbi", id, x, y);
      else if (x >= 5 && y >= 5) push(misaligned, "fapbi", id, x, y);
    }
  }
  return { aligned, misaligned };
}

export function buildInterpreterInput(
  stage1: Stage1Output,
  responses: { a: Record<string, Array<{ item_id: string; value: number; pass?: string }>>; b: Record<string, Array<{ item_id: string; value: number; pass?: string }>> },
  consent: { a: { share_mental_health_scores: boolean }; b: { share_mental_health_scores: boolean } },
): InterpreterInput {
  const flags_by_domain: InterpreterInput["flags_by_domain"] = {};
  for (const f of stage1.flags) {
    (flags_by_domain[f.domain] ??= []).push({ rule_key: f.rule_key, weight: f.weight, label: f.label, triggered_by: f.triggered_by });
  }
  const { aligned, misaligned } = computeCandidates(stage1, responses);
  return {
    distress_context: stage1.distress_context,
    scores_a: maskScores(stage1.scores.a, consent.a.share_mental_health_scores),
    scores_b: maskScores(stage1.scores.b, consent.b.share_mental_health_scores),
    couple_scores: stage1.couple_scores.map((c) => ({ metric: c.metric, value: c.value, details: c.details, ...(c.unvalidated ? { unvalidated: true } : {}) })),
    flags_by_domain,
    aligned_candidates: aligned.slice(0, 60),
    misaligned_candidates: misaligned.slice(0, 60),
    unvalidated_instruments: Object.values(INSTRUMENTS)
      .filter((m) => m.definition.unvalidated)
      .map((m) => m.definition.key),
  };
}

/** Deterministic one-sentence summaries for mental-health instruments (never sent to the model for the other partner). */
export function mentalHealthSentences(scores: Score[]): Array<{ instrument_key: string; sentence: string }> {
  const out: Array<{ instrument_key: string; sentence: string }> = [];
  for (const s of scores) {
    if (!isMentalHealthKey(s.instrument_key) || s.subscale !== "total") continue;
    const def = INSTRUMENTS[s.instrument_key as InstrumentKey].definition;
    const label = s.cutoff_label ? s.cutoff_label.replace(/_/g, " ") : "no published cutoff";
    out.push({
      instrument_key: s.instrument_key,
      sentence: `Your ${def.name} total is ${s.value}, in the ${label} range. Screener result; clinical evaluation required. This number is private to you unless you choose to share it.`,
    });
  }
  return out;
}

/** Merge the model's private summaries for one user with the code-generated mental-health sentences. */
export function privateResultsFor(side: "a" | "b", output: InterpreterOutput, ownScores: Score[], stage1: Stage1Output) {
  const modelSentences = output.private_summaries.find((p) => p.user === side)?.sentences ?? [];
  const mh = mentalHealthSentences(ownScores);
  const seen = new Set(mh.map((m) => m.instrument_key));
  const sentences = [...mh, ...modelSentences.filter((s) => !seen.has(s.instrument_key) && !isMentalHealthKey(s.instrument_key))];
  return {
    sentences,
    distress_note: output.distress_note,
    flagged_domains: stage1.domains.map((d) => ({ domain: d.domain, weight: d.weight, flag_count: d.flag_count })),
    perception_gaps: stage1.perception_gaps[side],
    generated_label: "Sentences other than instrument scores are generated by the interpreter; not validated.",
  };
}
