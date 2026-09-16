/**
 * Test helpers for building Response[] sets and complete, benign couples.
 *
 * Every helper reads item ids, passes and scales from the loaded instrument definitions, so the
 * helpers stay correct when an owner edits config/instruments/*.json. Benign values are chosen so
 * that runStage1(completeCouple()) produces zero flags and distress_context false; the test in
 * tests/unit/stage1.test.ts asserts exactly that.
 */
import { scaleFor } from "@/instruments/define";
import { INSTRUMENTS, requiredInstruments, type InstrumentKey } from "@/instruments/registry";
import type { InstrumentItem, Response, Score } from "@/instruments/schema";
import type { Stage1Input } from "@/lib/interpretation/stage1";

/** Index Score[] by subscale name for readable assertions. */
export function scoreMap(scores: Score[]): Record<string, Score> {
  return Object.fromEntries(scores.map((s) => [s.subscale, s]));
}

/**
 * A complete set where the listed items take the given values and every other item takes `fill`
 * (default: the scale minimum). Single-pass instruments only; use fullResponses for multi-pass ones.
 */
export function responsesFrom(key: InstrumentKey, values: Record<string, number>, fill?: number): Response[] {
  return fullResponses(key, (item, _pass, scale) => values[item.item_id] ?? fill ?? scale.min);
}

export type Scale = { min: number; max: number };
export type ValueFn = (item: InstrumentItem, pass: string, scale: Scale) => number;

export function definitionOf(key: InstrumentKey) {
  return INSTRUMENTS[key].definition;
}

/**
 * A complete Response[] for an instrument: every pass x every item.
 * `pass` is set explicitly only for multi-pass instruments (single-pass responses rely on the default).
 * valueFn defaults to the scale minimum.
 */
export function fullResponses(key: InstrumentKey, valueFn: ValueFn = (_item, _pass, scale) => scale.min): Response[] {
  const def = definitionOf(key);
  const multi = def.passes.length > 1;
  const out: Response[] = [];
  for (const pass of def.passes) {
    for (const item of def.items) {
      const scale = scaleFor(item, pass);
      const value = valueFn(item, pass, scale);
      out.push(multi ? { item_id: item.item_id, value, pass } : { item_id: item.item_id, value });
    }
  }
  return out;
}

export function maxResponses(key: InstrumentKey): Response[] {
  return fullResponses(key, (_item, _pass, scale) => scale.max);
}

export function minResponses(key: InstrumentKey): Response[] {
  return fullResponses(key, (_item, _pass, scale) => scale.min);
}

/** Midpoint of each item's scale, rounded half up (0..3 -> 2, 1..9 -> 5, -3..3 -> 0, 0..99 -> 50). */
export function midResponses(key: InstrumentKey): Response[] {
  return fullResponses(key, (_item, _pass, scale) => Math.round((scale.min + scale.max) / 2));
}

/** Same value on every item and pass. */
export function constantResponses(key: InstrumentKey, value: number): Response[] {
  return fullResponses(key, () => value);
}

/** Return a copy of `responses` with one item (in one pass) changed. Throws if the item/pass is not present. */
export function setItem(
  responses: Response[],
  itemId: string,
  patch: number | Partial<Pick<Response, "value" | "needs_context">>,
  pass?: string,
): Response[] {
  const p = typeof patch === "number" ? { value: patch } : patch;
  let hit = false;
  const out = responses.map((r) => {
    const samePass = pass === undefined ? true : r.pass === pass;
    if (r.item_id === itemId && samePass) {
      hit = true;
      return { ...r, ...p };
    }
    return r;
  });
  if (!hit) throw new Error(`setItem: no response for ${itemId}${pass ? ` in pass ${pass}` : ""}`);
  return out;
}

/** Apply several item patches in sequence. Each entry is [itemId, patch, pass?]. */
export function setItems(
  responses: Response[],
  patches: Array<[string, number | Partial<Pick<Response, "value" | "needs_context">>, string?]>,
): Response[] {
  return patches.reduce((acc, [id, patch, pass]) => setItem(acc, id, patch, pass), responses);
}

/** Drop one item (in every pass, or one pass) so the set is incomplete. */
export function withoutItem(responses: Response[], itemId: string, pass?: string): Response[] {
  return responses.filter((r) => !(r.item_id === itemId && (pass === undefined || r.pass === pass)));
}

/**
 * Benign, flag-free responses for one instrument. The values below are chosen against
 * config/flag_rules.json so that no rule can fire and neither distress threshold is reached:
 *   acq: 0 on both passes (desired change 0, perceived-vs-actual miss 0)
 *   fapbi: frequency 5, acceptability 9 (rule fires at acceptability <= 4)
 *   who_does_what: now = ideal = 5 (gap 0; both "now" at 5 mirror to 5, disagreement 0)
 *   rdas: every item at its maximum (consensus 5; rule fires at <= 2)
 *   brief_crs: undermining and exposure_to_conflict items 0, everything else 6 (rule fires above 3)
 *   psdq_sf: 3 everywhere (identical for both partners, gap 0)
 *   map: intensity 0, efficacy 100 (rule needs intensity >= 50 and efficacy <= 50)
 *   polarization: 4 on all three passes (gap 0, no loop)
 *   phq9 / gad7 / oci_r: 0 everywhere (totals 0; distress needs >= 10)
 *   everything else: scale midpoint (no rules read them)
 */
export function benignResponses(key: InstrumentKey): Response[] {
  switch (key) {
    case "acq":
      return constantResponses("acq", 0);
    case "fapbi":
      return fullResponses("fapbi", (_item, pass) => (pass === "acceptability" ? 9 : 5));
    case "who_does_what":
      return constantResponses("who_does_what", 5);
    case "rdas":
      return maxResponses("rdas");
    case "csi16":
      return maxResponses("csi16");
    case "brief_crs": {
      const negative = new Set(["brief_crs_5", "brief_crs_6", "brief_crs_9", "brief_crs_10"]);
      return fullResponses("brief_crs", (item) => (negative.has(item.item_id) ? 0 : 6));
    }
    case "psdq_sf":
      return constantResponses("psdq_sf", 3);
    case "map":
      return fullResponses("map", (_item, pass) => (pass === "efficacy" ? 100 : 0));
    case "polarization":
      return constantResponses("polarization", 4);
    case "phq9":
    case "gad7":
    case "oci_r":
      return constantResponses(key, 0);
    default:
      return midResponses(key);
  }
}

export type PartnerOverride = Response[] | ((benign: Response[]) => Response[]);
export type PartnerOverrides = Partial<Record<InstrumentKey, PartnerOverride>>;

export type CoupleOverrides = {
  hasChildren?: boolean;
  /** Extra (optional) instruments to include for both partners, e.g. ["oci_r", "prqc"]. */
  include?: InstrumentKey[];
  a?: PartnerOverrides;
  b?: PartnerOverrides;
};

function buildSide(keys: InstrumentKey[], overrides: PartnerOverrides | undefined): Record<string, Response[]> {
  const out: Record<string, Response[]> = {};
  const all = new Set<InstrumentKey>([...keys, ...(Object.keys(overrides ?? {}) as InstrumentKey[])]);
  for (const key of all) {
    const benign = benignResponses(key);
    const ov = overrides?.[key];
    out[key] = ov === undefined ? benign : typeof ov === "function" ? ov(benign) : ov;
  }
  return out;
}

/**
 * A complete Stage1Input for a couple (with children by default) where every required instrument is
 * filled with benign values. Override an instrument for one partner with a replacement Response[] or a
 * function that transforms the benign default (compose with setItem/setItems).
 */
export function completeCouple(overrides: CoupleOverrides = {}): Stage1Input {
  const hasChildren = overrides.hasChildren ?? true;
  const req = requiredInstruments({ hasChildren });
  const keys: InstrumentKey[] = [...req.layer0, ...req.layer1, ...(overrides.include ?? [])];
  return {
    hasChildren,
    a: buildSide(keys, overrides.a),
    b: buildSide(keys, overrides.b),
  };
}
