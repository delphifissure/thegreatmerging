/**
 * Per-person, per-item derived metrics for multi-pass instruments.
 * Pure and synchronous. These feed the flag rules and the couple-level
 * computations; they are not stored as `scores` rows.
 */
import { indexResponses, responseKey } from "./define";
import type { DerivedMetric, InstrumentDefinition, Response } from "./schema";

function passValue(
  idx: Map<string, Response>,
  pass: string,
  itemId: string,
): number | undefined {
  return idx.get(responseKey(pass, itemId))?.value;
}

/**
 * Derived metrics for one person's responses to one instrument.
 * Missing items are skipped rather than thrown, so partial sets produce partial metrics;
 * callers that require completeness check it first with isComplete().
 */
export function deriveMetrics(def: InstrumentDefinition, responses: Response[]): DerivedMetric[] {
  const idx = indexResponses(def, responses);
  const out: DerivedMetric[] = [];
  const tag = def.unvalidated ? { unvalidated: true as const } : {};
  const push = (metric: string, item_id: string, value: number | undefined) => {
    if (value === undefined || Number.isNaN(value)) return;
    out.push({ instrument_key: def.key, metric, item_id, value, ...tag });
  };

  // Raw per-pass values for every multi-pass instrument, so downstream code never re-indexes responses.
  if (def.passes.length > 1) {
    for (const item of def.items) {
      for (const pass of def.passes) push(`value:${pass}`, item.item_id, passValue(idx, pass, item.item_id));
    }
  }

  switch (def.key) {
    case "acq": {
      // Desired change I want from my partner (self pass), and what I think my partner wants from me.
      for (const item of def.items) {
        push("desired_change", item.item_id, passValue(idx, "self", item.item_id));
        push("perceived_partner_wants", item.item_id, passValue(idx, "partner_wants", item.item_id));
      }
      break;
    }
    case "who_does_what": {
      for (const item of def.items) {
        const now = passValue(idx, "now", item.item_id);
        const ideal = passValue(idx, "ideal", item.item_id);
        if (now !== undefined && ideal !== undefined) push("now_ideal_gap", item.item_id, Math.abs(now - ideal));
      }
      break;
    }
    case "polarization": {
      for (const item of def.items) {
        const alone = passValue(idx, "self_alone", item.item_id);
        const withPartner = passValue(idx, "self_with_partner", item.item_id);
        if (alone !== undefined && withPartner !== undefined) push("gap", item.item_id, withPartner - alone);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

export function metricMap(metrics: DerivedMetric[], metric: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of metrics) if (d.metric === metric) m.set(d.item_id, d.value);
  return m;
}
