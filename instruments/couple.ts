/**
 * Couple-level computations. Pure and synchronous.
 *
 * Takes both partners' Score[] and Response[] and returns CoupleScore rows:
 *   - ACQ perceptual accuracy (A about B, B about A), with items missed by 2+
 *   - Who Does What disagreement between the two "now" ratings
 *   - CPQ demand-withdraw in both directions
 *   - MAP areas with high intensity and low efficacy
 *   - PSDQ between-parent gap per style
 *   - Polarization gaps and loops (unvalidated)
 *
 * Mental-health instruments (PHQ-9, GAD-7, OCI-R) are never read here. PHQ-9 item 9
 * in particular is never part of any couple-level computation; tests assert this.
 */
import { deriveMetrics, metricMap } from "./derived";
import { INSTRUMENTS, MENTAL_HEALTH_KEYS } from "./registry";
import type { Response, Score } from "./schema";

export type PartnerSide = "a" | "b";

export type PartnerData = {
  /** instrument_key -> responses. Mental-health instruments may be present; they are ignored here. */
  responses: Record<string, Response[]>;
  scores: Score[];
};

export type CoupleScore = {
  metric: string;
  value: number;
  details: Record<string, unknown>;
  unvalidated?: boolean;
};

export type CoupleThresholds = {
  acq_perceptual_miss_at_or_above: number;
  wdw_now_disagreement_at_or_above: number;
  map_intensity_at_or_above: number;
  map_efficacy_at_or_below: number;
  polarization_gap_abs_at_or_above: number;
};

export const DEFAULT_COUPLE_THRESHOLDS: CoupleThresholds = {
  acq_perceptual_miss_at_or_above: 2,
  wdw_now_disagreement_at_or_above: 3,
  map_intensity_at_or_above: 50,
  map_efficacy_at_or_below: 50,
  polarization_gap_abs_at_or_above: 2,
};

function scoreOf(scores: Score[], instrument: string, subscale: string): number | undefined {
  return scores.find((s) => s.instrument_key === instrument && s.subscale === subscale)?.value;
}

function derivedFor(p: PartnerData, key: string) {
  const responses = p.responses[key];
  if (!responses) return undefined;
  return deriveMetrics(INSTRUMENTS[key as keyof typeof INSTRUMENTS].definition, responses);
}

/** Strip mental-health instruments so nothing below can touch them, even by accident. */
function withoutMentalHealth(p: PartnerData): PartnerData {
  const responses: Record<string, Response[]> = {};
  for (const [k, v] of Object.entries(p.responses)) {
    if ((MENTAL_HEALTH_KEYS as readonly string[]).includes(k)) continue;
    responses[k] = v;
  }
  return { responses, scores: p.scores.filter((s) => !(MENTAL_HEALTH_KEYS as readonly string[]).includes(s.instrument_key)) };
}

export function computeCoupleScores(
  aIn: PartnerData,
  bIn: PartnerData,
  thresholds: CoupleThresholds = DEFAULT_COUPLE_THRESHOLDS,
): CoupleScore[] {
  const a = withoutMentalHealth(aIn);
  const b = withoutMentalHealth(bIn);
  const out: CoupleScore[] = [];

  // ---- ACQ perceptual accuracy ----
  const acqA = derivedFor(a, "acq");
  const acqB = derivedFor(b, "acq");
  if (acqA && acqB) {
    const acqDef = INSTRUMENTS.acq.definition;
    const accuracy = (perceiver: typeof acqA, target: typeof acqB, label: string) => {
      const thinks = metricMap(perceiver, "perceived_partner_wants");
      const actual = metricMap(target, "desired_change");
      const misses: Array<{ item_id: string; descriptor: string; perceived: number; actual: number; miss: number }> = [];
      let compared = 0;
      let agree = 0;
      for (const item of acqDef.items) {
        const p = thinks.get(item.item_id);
        const t = actual.get(item.item_id);
        if (p === undefined || t === undefined) continue;
        compared++;
        const miss = Math.abs(p - t);
        if (miss < thresholds.acq_perceptual_miss_at_or_above) agree++;
        else misses.push({ item_id: item.item_id, descriptor: item.descriptor, perceived: p, actual: t, miss });
      }
      out.push({
        metric: label,
        value: compared === 0 ? 1 : agree / compared,
        details: { compared, misses, threshold: thresholds.acq_perceptual_miss_at_or_above },
      });
    };
    accuracy(acqA, acqB, "acq_perceptual_accuracy_a_about_b");
    accuracy(acqB, acqA, "acq_perceptual_accuracy_b_about_a");
  }

  // ---- Who Does What: disagreement between the two "now" ratings ----
  const wdwA = derivedFor(a, "who_does_what");
  const wdwB = derivedFor(b, "who_does_what");
  if (wdwA && wdwB) {
    const def = INSTRUMENTS.who_does_what.definition;
    const nowA = metricMap(wdwA, "value:now");
    const nowB = metricMap(wdwB, "value:now");
    const items: Array<{ item_id: string; descriptor: string; a_now: number; b_now_mirrored: number; disagreement: number }> = [];
    let count = 0;
    for (const item of def.items) {
      const x = nowA.get(item.item_id);
      const y = nowB.get(item.item_id);
      if (x === undefined || y === undefined) continue;
      // Both rate 1 = "I do it all" … 9 = "partner does it all". Mirror B onto A's frame.
      const yMirrored = item.scale.min + item.scale.max - y;
      const disagreement = Math.abs(x - yMirrored);
      items.push({ item_id: item.item_id, descriptor: item.descriptor, a_now: x, b_now_mirrored: yMirrored, disagreement });
      if (disagreement >= thresholds.wdw_now_disagreement_at_or_above) count++;
    }
    out.push({
      metric: "wdw_now_disagreement",
      value: count,
      details: { items, threshold: thresholds.wdw_now_disagreement_at_or_above },
    });
  }

  // ---- CPQ demand-withdraw, both directions ----
  const aSelfDemand = scoreOf(a.scores, "cpq_sf", "self_demand_partner_withdraw");
  const aPartnerDemand = scoreOf(a.scores, "cpq_sf", "partner_demand_self_withdraw");
  const bSelfDemand = scoreOf(b.scores, "cpq_sf", "self_demand_partner_withdraw");
  const bPartnerDemand = scoreOf(b.scores, "cpq_sf", "partner_demand_self_withdraw");
  if ([aSelfDemand, aPartnerDemand, bSelfDemand, bPartnerDemand].every((v) => v !== undefined)) {
    out.push({
      metric: "cpq_a_demand_b_withdraw",
      value: (aSelfDemand! + bPartnerDemand!) / 2,
      details: { a_reports: aSelfDemand, b_reports: bPartnerDemand },
    });
    out.push({
      metric: "cpq_b_demand_a_withdraw",
      value: (bSelfDemand! + aPartnerDemand!) / 2,
      details: { b_reports: bSelfDemand, a_reports: aPartnerDemand },
    });
  }

  // ---- MAP: high intensity, low efficacy ----
  const mapA = derivedFor(a, "map");
  const mapB = derivedFor(b, "map");
  if (mapA && mapB) {
    const def = INSTRUMENTS.map.definition;
    const areas: Array<{ item_id: string; descriptor: string; by: PartnerSide[]; a: { intensity?: number; efficacy?: number }; b: { intensity?: number; efficacy?: number } }> = [];
    for (const item of def.items) {
      const rec = {
        a: { intensity: metricMap(mapA, "value:intensity").get(item.item_id), efficacy: metricMap(mapA, "value:efficacy").get(item.item_id) },
        b: { intensity: metricMap(mapB, "value:intensity").get(item.item_id), efficacy: metricMap(mapB, "value:efficacy").get(item.item_id) },
      };
      const by: PartnerSide[] = [];
      for (const side of ["a", "b"] as const) {
        const v = rec[side];
        if (
          v.intensity !== undefined &&
          v.efficacy !== undefined &&
          v.intensity >= thresholds.map_intensity_at_or_above &&
          v.efficacy <= thresholds.map_efficacy_at_or_below
        ) {
          by.push(side);
        }
      }
      if (by.length > 0) areas.push({ item_id: item.item_id, descriptor: item.descriptor, by, ...rec });
    }
    out.push({
      metric: "map_high_intensity_low_efficacy",
      value: areas.length,
      details: { areas, intensity_at_or_above: thresholds.map_intensity_at_or_above, efficacy_at_or_below: thresholds.map_efficacy_at_or_below },
    });
  }

  // ---- PSDQ between-parent gap per style ----
  for (const style of ["authoritative", "authoritarian", "permissive"]) {
    const x = scoreOf(a.scores, "psdq_sf", style);
    const y = scoreOf(b.scores, "psdq_sf", style);
    if (x === undefined || y === undefined) continue;
    out.push({ metric: `psdq_gap_${style}`, value: Math.abs(x - y), details: { a: x, b: y, style } });
  }

  // ---- Polarization (unvalidated) ----
  const polA = derivedFor(a, "polarization");
  const polB = derivedFor(b, "polarization");
  if (polA && polB) {
    const def = INSTRUMENTS.polarization.definition;
    const gapA = metricMap(polA, "gap");
    const gapB = metricMap(polB, "gap");
    const dims: Array<{ item_id: string; descriptor: string; a_gap: number; b_gap: number; loop: boolean }> = [];
    let loops = 0;
    for (const item of def.items) {
      const x = gapA.get(item.item_id);
      const y = gapB.get(item.item_id);
      if (x === undefined || y === undefined) continue;
      const t = thresholds.polarization_gap_abs_at_or_above;
      const loop = Math.sign(x) !== 0 && Math.sign(y) !== 0 && Math.sign(x) !== Math.sign(y) && Math.abs(x) >= t && Math.abs(y) >= t;
      if (loop) loops++;
      dims.push({ item_id: item.item_id, descriptor: item.descriptor, a_gap: x, b_gap: y, loop });
    }
    out.push({
      metric: "polarization_loop",
      value: loops,
      details: { dimensions: dims, threshold: thresholds.polarization_gap_abs_at_or_above, unvalidated: true },
      unvalidated: true,
    });
  }

  return out;
}
