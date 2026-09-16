/**
 * Interpretation stage 1: deterministic, no LLM.
 *
 * Given both partners' complete response sets:
 *   1. score every instrument (pure functions),
 *   2. compute couple scores,
 *   3. apply config/flag_rules.json to produce weighted flags,
 *   4. map flags to domains and order domains by summed weight,
 *   5. compute distress_context (either partner's PHQ-9 or GAD-7 at or above 10).
 *
 * The same function runs inside the Inngest job and in the synthetic-couple evals,
 * so the evals exercise exactly the production pipeline.
 */
import flagRulesJson from "@/config/flag_rules.json";
import { computeCoupleScores, type CoupleScore, type CoupleThresholds } from "@/instruments/couple";
import { deriveMetrics, metricMap } from "@/instruments/derived";
import { isComplete } from "@/instruments/define";
import { INSTRUMENTS, MENTAL_HEALTH_KEYS, requiredInstruments, type InstrumentKey } from "@/instruments/registry";
import { DOMAINS, type DerivedMetric, type Domain, type Response, type Score } from "@/instruments/schema";

export type FlagRules = typeof flagRulesJson;
export const FLAG_RULES: FlagRules = flagRulesJson;

export type PartnerSide = "a" | "b";

export type Flag = {
  domain: Domain;
  rule_key: string;
  weight: number;
  label?: string;
  triggered_by: {
    instrument: string;
    item?: string;
    descriptor?: string;
    user?: PartnerSide | "both";
    values: Record<string, number | string | boolean>;
    unvalidated?: boolean;
  };
};

export type DomainSummary = { domain: Domain; weight: number; flag_count: number };

/**
 * A perception gap for one user: their own rating on an item versus the partner's rating of them,
 * differing by 2 or more. Sources: ACQ (what I think my partner wants from me vs what the partner
 * actually wants) and the polarization mirror (how I say I become with my partner vs how the
 * partner says I become; unvalidated).
 */
export type PerceptionGap = {
  instrument: "acq" | "polarization";
  item_ref: string;
  descriptor: string;
  domain: Domain;
  self_value: number;
  partner_value: number;
  gap: number;
  unvalidated?: boolean;
};

export type Stage1Input = {
  hasChildren: boolean;
  a: Record<string, Response[]>;
  b: Record<string, Response[]>;
};

export type Stage1Output = {
  scores: { a: Score[]; b: Score[] };
  derived: { a: DerivedMetric[]; b: DerivedMetric[] };
  couple_scores: CoupleScore[];
  flags: Flag[];
  domains: DomainSummary[];
  perception_gaps: { a: PerceptionGap[]; b: PerceptionGap[] };
  distress_context: boolean;
  rules_version: string;
};

export class MissingInstrumentsError extends Error {
  constructor(public readonly missing: Array<{ user: PartnerSide; instrument: string }>) {
    super(`interpretation requires complete responses: ${missing.map((m) => `${m.user}:${m.instrument}`).join(", ")}`);
    this.name = "MissingInstrumentsError";
  }
}

function domainOf(instrument: InstrumentKey, itemId?: string, fallback?: Domain): Domain {
  const def = INSTRUMENTS[instrument].definition;
  if (itemId) {
    const item = def.items.find((i) => i.item_id === itemId);
    if (item?.domain) return item.domain;
  }
  return def.default_domain ?? fallback ?? "communication";
}

function descriptorOf(instrument: InstrumentKey, itemId: string): string | undefined {
  return INSTRUMENTS[instrument].definition.items.find((i) => i.item_id === itemId)?.descriptor;
}

export function scoreAll(responses: Record<string, Response[]>): Score[] {
  const scores: Score[] = [];
  for (const [key, rs] of Object.entries(responses)) {
    const mod = INSTRUMENTS[key as InstrumentKey];
    if (!mod) throw new Error(`unknown instrument ${key}`);
    if (!isComplete(mod.definition, rs)) continue;
    scores.push(...mod.score(rs));
  }
  return scores;
}

export function deriveAll(responses: Record<string, Response[]>): DerivedMetric[] {
  const out: DerivedMetric[] = [];
  for (const [key, rs] of Object.entries(responses)) {
    const mod = INSTRUMENTS[key as InstrumentKey];
    if (!mod) throw new Error(`unknown instrument ${key}`);
    out.push(...deriveMetrics(mod.definition, rs));
  }
  return out;
}

export function coupleThresholdsFromRules(rules: FlagRules = FLAG_RULES): CoupleThresholds {
  return {
    acq_perceptual_miss_at_or_above: rules.rules.acq_perceptual_miss.miss_at_or_above,
    wdw_now_disagreement_at_or_above: rules.rules.wdw_now_disagreement.disagreement_at_or_above,
    map_intensity_at_or_above: rules.rules.map_high_intensity_low_efficacy.intensity_at_or_above,
    map_efficacy_at_or_below: rules.rules.map_high_intensity_low_efficacy.efficacy_at_or_below,
    polarization_gap_abs_at_or_above: rules.rules.polarization_loop.gap_abs_at_or_above,
  };
}

/** Either partner's PHQ-9 total or GAD-7 total at or above the configured threshold. */
export function computeDistressContext(scoresA: Score[], scoresB: Score[], rules: FlagRules = FLAG_RULES): boolean {
  const check = (scores: Score[]) => {
    const phq = scores.find((s) => s.instrument_key === "phq9" && s.subscale === "total")?.value;
    const gad = scores.find((s) => s.instrument_key === "gad7" && s.subscale === "total")?.value;
    return (
      (phq !== undefined && phq >= rules.distress_context.phq9_total_at_or_above) ||
      (gad !== undefined && gad >= rules.distress_context.gad7_total_at_or_above)
    );
  };
  return check(scoresA) || check(scoresB);
}

type Side = { side: PartnerSide; responses: Record<string, Response[]>; scores: Score[]; derived: DerivedMetric[] };

export function computeFlags(
  a: Side,
  b: Side,
  coupleScores: CoupleScore[],
  rules: FlagRules = FLAG_RULES,
): Flag[] {
  const flags: Flag[] = [];
  const R = rules.rules;
  const sides = [a, b];

  // MAP: intensity high and efficacy low → weight 3, per area, per partner.
  {
    const cs = coupleScores.find((c) => c.metric === "map_high_intensity_low_efficacy");
    const areas = (cs?.details.areas ?? []) as Array<{ item_id: string; by: PartnerSide[]; a: { intensity?: number; efficacy?: number }; b: { intensity?: number; efficacy?: number } }>;
    for (const area of areas) {
      for (const side of area.by) {
        flags.push({
          domain: domainOf("map", area.item_id),
          rule_key: "map_high_intensity_low_efficacy",
          weight: R.map_high_intensity_low_efficacy.weight,
          triggered_by: {
            instrument: "map",
            item: area.item_id,
            descriptor: descriptorOf("map", area.item_id),
            user: side,
            values: { intensity: area[side].intensity ?? 0, efficacy: area[side].efficacy ?? 0 },
          },
        });
      }
    }
  }

  // ACQ: desired change of ±2 or beyond on any item → weight 2.
  for (const s of sides) {
    const desired = metricMap(s.derived.filter((d) => d.instrument_key === "acq"), "desired_change");
    for (const [itemId, v] of desired) {
      if (Math.abs(v) >= R.acq_desired_change.abs_change_at_or_above) {
        flags.push({
          domain: domainOf("acq", itemId),
          rule_key: "acq_desired_change",
          weight: R.acq_desired_change.weight,
          triggered_by: { instrument: "acq", item: itemId, descriptor: descriptorOf("acq", itemId), user: s.side, values: { desired_change: v } },
        });
      }
    }
  }

  // ACQ: perceptual miss of 2 or more → weight 2 (attributed to the perceiver).
  for (const [metric, perceiver] of [
    ["acq_perceptual_accuracy_a_about_b", "a"],
    ["acq_perceptual_accuracy_b_about_a", "b"],
  ] as const) {
    const cs = coupleScores.find((c) => c.metric === metric);
    const misses = (cs?.details.misses ?? []) as Array<{ item_id: string; perceived: number; actual: number; miss: number }>;
    for (const m of misses) {
      if (m.miss >= R.acq_perceptual_miss.miss_at_or_above) {
        flags.push({
          domain: domainOf("acq", m.item_id),
          rule_key: "acq_perceptual_miss",
          weight: R.acq_perceptual_miss.weight,
          triggered_by: {
            instrument: "acq",
            item: m.item_id,
            descriptor: descriptorOf("acq", m.item_id),
            user: perceiver,
            values: { perceived: m.perceived, actual: m.actual, miss: m.miss },
          },
        });
      }
    }
  }

  // FAPBI: any behavior unacceptable at current frequency → weight 2.
  for (const s of sides) {
    const fap = s.derived.filter((d) => d.instrument_key === "fapbi");
    const acc = metricMap(fap, "value:acceptability");
    const freq = metricMap(fap, "value:frequency");
    for (const [itemId, v] of acc) {
      if (v <= R.fapbi_unacceptable.acceptability_at_or_below) {
        flags.push({
          domain: domainOf("fapbi", itemId),
          rule_key: "fapbi_unacceptable",
          weight: R.fapbi_unacceptable.weight,
          triggered_by: {
            instrument: "fapbi",
            item: itemId,
            descriptor: descriptorOf("fapbi", itemId),
            user: s.side,
            values: { acceptability: v, frequency: freq.get(itemId) ?? 0 },
          },
        });
      }
    }
  }

  // Who Does What: now-versus-ideal gap of 3+ for either person → weight 2.
  for (const s of sides) {
    const gaps = metricMap(s.derived.filter((d) => d.instrument_key === "who_does_what"), "now_ideal_gap");
    for (const [itemId, v] of gaps) {
      if (v >= R.wdw_now_ideal_gap.gap_at_or_above) {
        flags.push({
          domain: domainOf("who_does_what", itemId),
          rule_key: "wdw_now_ideal_gap",
          weight: R.wdw_now_ideal_gap.weight,
          triggered_by: { instrument: "who_does_what", item: itemId, descriptor: descriptorOf("who_does_what", itemId), user: s.side, values: { now_ideal_gap: v } },
        });
      }
    }
  }
  // Who Does What: "now" ratings differ by 3+ → weight 2 (both).
  {
    const cs = coupleScores.find((c) => c.metric === "wdw_now_disagreement");
    const items = (cs?.details.items ?? []) as Array<{ item_id: string; a_now: number; b_now_mirrored: number; disagreement: number }>;
    for (const it of items) {
      if (it.disagreement >= R.wdw_now_disagreement.disagreement_at_or_above) {
        flags.push({
          domain: domainOf("who_does_what", it.item_id),
          rule_key: "wdw_now_disagreement",
          weight: R.wdw_now_disagreement.weight,
          triggered_by: {
            instrument: "who_does_what",
            item: it.item_id,
            descriptor: descriptorOf("who_does_what", it.item_id),
            user: "both",
            values: { a_now: it.a_now, b_now_mirrored: it.b_now_mirrored, disagreement: it.disagreement },
          },
        });
      }
    }
  }

  // RDAS consensus item at "frequently disagree" or worse by either person → weight 2.
  for (const s of sides) {
    const rdas = s.responses.rdas ?? [];
    const consensusItems = new Set(INSTRUMENTS.rdas.definition.scoring.subscales.find((x) => x.name === R.rdas_consensus_disagree.subscale)?.items ?? []);
    for (const r of rdas) {
      if (!consensusItems.has(r.item_id)) continue;
      if (r.value <= R.rdas_consensus_disagree.value_at_or_below) {
        flags.push({
          domain: domainOf("rdas", r.item_id),
          rule_key: "rdas_consensus_disagree",
          weight: R.rdas_consensus_disagree.weight,
          triggered_by: { instrument: "rdas", item: r.item_id, descriptor: descriptorOf("rdas", r.item_id), user: s.side, values: { value: r.value } },
        });
      }
    }
  }

  // Brief CRS: undermining or exposure-to-conflict above midpoint by either person → weight 3.
  for (const s of sides) {
    for (const sub of R.brief_crs_negative_coparenting.subscales) {
      const sc = s.scores.find((x) => x.instrument_key === "brief_crs" && x.subscale === sub);
      if (sc && sc.value > R.brief_crs_negative_coparenting.above) {
        flags.push({
          domain: R.brief_crs_negative_coparenting.domain as Domain,
          rule_key: "brief_crs_negative_coparenting",
          weight: R.brief_crs_negative_coparenting.weight,
          triggered_by: { instrument: "brief_crs", user: s.side, values: { subscale: sub, value: sc.value } },
        });
      }
    }
  }

  // PSDQ: between-parent gap of 1.0+ on authoritarian or permissive → weight 3, values_conflict.
  for (const style of R.psdq_between_parent_gap.styles) {
    const cs = coupleScores.find((c) => c.metric === `psdq_gap_${style}`);
    if (cs && cs.value >= R.psdq_between_parent_gap.gap_at_or_above) {
      flags.push({
        domain: R.psdq_between_parent_gap.domain as Domain,
        rule_key: "psdq_between_parent_gap",
        weight: R.psdq_between_parent_gap.weight,
        label: R.psdq_between_parent_gap.label,
        triggered_by: { instrument: "psdq_sf", user: "both", values: { style, a: cs.details.a as number, b: cs.details.b as number, gap: cs.value } },
      });
    }
  }

  // Polarization: any loop → weight 2, shared_pattern, unvalidated.
  {
    const cs = coupleScores.find((c) => c.metric === "polarization_loop");
    const dims = (cs?.details.dimensions ?? []) as Array<{ item_id: string; a_gap: number; b_gap: number; loop: boolean }>;
    for (const d of dims) {
      if (!d.loop) continue;
      flags.push({
        domain: domainOf("polarization", d.item_id),
        rule_key: "polarization_loop",
        weight: R.polarization_loop.weight,
        label: R.polarization_loop.label,
        triggered_by: {
          instrument: "polarization",
          item: d.item_id,
          descriptor: descriptorOf("polarization", d.item_id),
          user: "both",
          values: { a_gap: d.a_gap, b_gap: d.b_gap },
          unvalidated: true,
        },
      });
    }
  }

  // Any item marked needs_context → weight 1, routed to the color layer as a context question.
  for (const s of sides) {
    for (const [key, rs] of Object.entries(s.responses)) {
      if ((MENTAL_HEALTH_KEYS as readonly string[]).includes(key)) continue; // never routed to a shared layer
      for (const r of rs) {
        if (!r.needs_context) continue;
        flags.push({
          domain: domainOf(key as InstrumentKey, r.item_id),
          rule_key: "needs_context",
          weight: R.needs_context.weight,
          label: R.needs_context.label,
          triggered_by: {
            instrument: key,
            item: r.item_id,
            descriptor: descriptorOf(key as InstrumentKey, r.item_id),
            user: s.side,
            values: { value: r.value, ...(r.pass ? { pass: r.pass } : {}) },
            ...(INSTRUMENTS[key as InstrumentKey].definition.unvalidated ? { unvalidated: true } : {}),
          },
        });
      }
    }
  }

  return flags;
}

export function summarizeDomains(flags: Flag[]): DomainSummary[] {
  const totals = new Map<Domain, DomainSummary>();
  for (const f of flags) {
    const cur = totals.get(f.domain) ?? { domain: f.domain, weight: 0, flag_count: 0 };
    cur.weight += f.weight;
    cur.flag_count += 1;
    totals.set(f.domain, cur);
  }
  return [...totals.values()].sort((x, y) => y.weight - x.weight || DOMAINS.indexOf(x.domain) - DOMAINS.indexOf(y.domain));
}

export function assertComplete(input: Stage1Input): void {
  const req = requiredInstruments({ hasChildren: input.hasChildren });
  const missing: Array<{ user: PartnerSide; instrument: string }> = [];
  for (const side of ["a", "b"] as const) {
    for (const key of [...req.layer0, ...req.layer1]) {
      const rs = input[side][key];
      if (!rs || !isComplete(INSTRUMENTS[key].definition, rs)) missing.push({ user: side, instrument: key });
    }
  }
  if (missing.length) throw new MissingInstrumentsError(missing);
}

export function computePerceptionGaps(
  coupleScores: CoupleScore[],
  derivedA: DerivedMetric[],
  derivedB: DerivedMetric[],
  rules: FlagRules = FLAG_RULES,
): { a: PerceptionGap[]; b: PerceptionGap[] } {
  const out = { a: [] as PerceptionGap[], b: [] as PerceptionGap[] };
  // ACQ: for the perceiver, "what I think my partner wants from me" vs what the partner actually wants.
  for (const [metric, side] of [
    ["acq_perceptual_accuracy_a_about_b", "a"],
    ["acq_perceptual_accuracy_b_about_a", "b"],
  ] as const) {
    const cs = coupleScores.find((c) => c.metric === metric);
    const misses = (cs?.details.misses ?? []) as Array<{ item_id: string; perceived: number; actual: number; miss: number }>;
    for (const m of misses) {
      out[side].push({
        instrument: "acq",
        item_ref: m.item_id,
        descriptor: descriptorOf("acq", m.item_id) ?? m.item_id,
        domain: domainOf("acq", m.item_id),
        self_value: m.perceived,
        partner_value: m.actual,
        gap: m.miss,
      });
    }
  }
  // Polarization mirror (unvalidated): my self_with_partner vs the partner's partner_becomes rating of me.
  const t = rules.rules.polarization_loop.gap_abs_at_or_above;
  const pairs: Array<[PartnerSide, DerivedMetric[], DerivedMetric[]]> = [
    ["a", derivedA, derivedB],
    ["b", derivedB, derivedA],
  ];
  for (const [side, mine, theirs] of pairs) {
    const self = metricMap(mine.filter((d) => d.instrument_key === "polarization"), "value:self_with_partner");
    const mirror = metricMap(theirs.filter((d) => d.instrument_key === "polarization"), "value:partner_becomes");
    for (const [itemId, sv] of self) {
      const pv = mirror.get(itemId);
      if (pv === undefined) continue;
      const gap = Math.abs(sv - pv);
      if (gap >= t) {
        out[side].push({
          instrument: "polarization",
          item_ref: itemId,
          descriptor: descriptorOf("polarization", itemId) ?? itemId,
          domain: domainOf("polarization", itemId),
          self_value: sv,
          partner_value: pv,
          gap,
          unvalidated: true,
        });
      }
    }
  }
  return out;
}

export function runStage1(input: Stage1Input, rules: FlagRules = FLAG_RULES): Stage1Output {
  assertComplete(input);
  const scoresA = scoreAll(input.a);
  const scoresB = scoreAll(input.b);
  const derivedA = deriveAll(input.a);
  const derivedB = deriveAll(input.b);
  const coupleScores = computeCoupleScores(
    { responses: input.a, scores: scoresA },
    { responses: input.b, scores: scoresB },
    coupleThresholdsFromRules(rules),
  );
  const flags = computeFlags(
    { side: "a", responses: input.a, scores: scoresA, derived: derivedA },
    { side: "b", responses: input.b, scores: scoresB, derived: derivedB },
    coupleScores,
    rules,
  );
  return {
    scores: { a: scoresA, b: scoresB },
    derived: { a: derivedA, b: derivedB },
    couple_scores: coupleScores,
    flags,
    domains: summarizeDomains(flags),
    perception_gaps: computePerceptionGaps(coupleScores, derivedA, derivedB, rules),
    distress_context: computeDistressContext(scoresA, scoresB, rules),
    rules_version: rules.version,
  };
}
