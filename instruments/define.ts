/**
 * Generic, pure, synchronous scorer driven by an instrument definition.
 * No I/O. Every instrument module delegates here; instrument-specific rules
 * (PHQ-9 item 9, couple-level metrics) live in lib/data and instruments/couple.ts.
 */
import {
  InstrumentDefinitionSchema,
  type Cutoff,
  type InstrumentDefinition,
  type InstrumentItem,
  type Response,
  type Score,
} from "./schema";

export class InstrumentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstrumentConfigError";
  }
}

export class IncompleteResponsesError extends Error {
  constructor(
    public readonly instrumentKey: string,
    public readonly missing: Array<{ item_id: string; pass: string }>,
  ) {
    super(
      `${instrumentKey}: missing ${missing.length} response(s): ${missing
        .map((m) => `${m.pass}:${m.item_id}`)
        .join(", ")}`,
    );
    this.name = "IncompleteResponsesError";
  }
}

export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

export function parseDefinition(raw: unknown): InstrumentDefinition {
  const result = InstrumentDefinitionSchema.safeParse(raw);
  if (!result.success) {
    const key =
      typeof raw === "object" && raw && "key" in raw ? String((raw as { key: unknown }).key) : "<unknown>";
    throw new InstrumentConfigError(
      `instrument ${key}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return result.data;
}

export function defaultPass(def: InstrumentDefinition): string {
  return def.passes[0];
}

export function itemById(def: InstrumentDefinition): Map<string, InstrumentItem> {
  return new Map(def.items.map((i) => [i.item_id, i]));
}

/** Reverse scoring per the prompt: scale.min + scale.max - value. */
export function reverseValue(item: InstrumentItem, value: number, pass?: string): number {
  const scale = scaleFor(item, pass);
  return scale.min + scale.max - value;
}

/** The scale that applies to an item in a given pass. */
export function scaleFor(item: InstrumentItem, pass?: string): { min: number; max: number; labels?: string[] } {
  if (pass && item.scale_by_pass && item.scale_by_pass[pass]) return item.scale_by_pass[pass];
  return item.scale;
}

export function responseKey(pass: string, itemId: string): string {
  return `${pass}::${itemId}`;
}

export function indexResponses(def: InstrumentDefinition, responses: Response[]): Map<string, Response> {
  const items = itemById(def);
  const out = new Map<string, Response>();
  for (const r of responses) {
    const item = items.get(r.item_id);
    if (!item) throw new InvalidResponseError(`${def.key}: unknown item ${r.item_id}`);
    const pass = r.pass ?? defaultPass(def);
    if (!def.passes.includes(pass)) throw new InvalidResponseError(`${def.key}: unknown pass ${pass}`);
    if (!Number.isFinite(r.value) || !Number.isInteger(r.value)) {
      throw new InvalidResponseError(`${def.key}: ${r.item_id} value must be an integer`);
    }
    const scale = scaleFor(item, pass);
    if (r.value < scale.min || r.value > scale.max) {
      throw new InvalidResponseError(
        `${def.key}: ${r.item_id} value ${r.value} outside scale ${scale.min}..${scale.max}`,
      );
    }
    out.set(responseKey(pass, r.item_id), r);
  }
  return out;
}

export function missingResponses(
  def: InstrumentDefinition,
  responses: Response[],
): Array<{ item_id: string; pass: string }> {
  const idx = indexResponses(def, responses);
  const missing: Array<{ item_id: string; pass: string }> = [];
  for (const pass of def.passes) {
    for (const item of def.items) {
      if (!idx.has(responseKey(pass, item.item_id))) missing.push({ item_id: item.item_id, pass });
    }
  }
  return missing;
}

export function isComplete(def: InstrumentDefinition, responses: Response[]): boolean {
  return missingResponses(def, responses).length === 0;
}

export function cutoffLabel(cutoffs: Cutoff[], subscale: string, value: number): string | null {
  for (const c of cutoffs) {
    if (c.subscale !== subscale) continue;
    if (c.below !== undefined && !(value < c.below)) continue;
    if (c.at_or_below !== undefined && !(value <= c.at_or_below)) continue;
    if (c.above !== undefined && !(value > c.above)) continue;
    if (c.at_or_above !== undefined && !(value >= c.at_or_above)) continue;
    return c.label;
  }
  return null;
}

/** Value of one item in one pass after reverse scoring when the method asks for it. */
export function scoredValue(
  def: InstrumentDefinition,
  item: InstrumentItem,
  raw: number,
  reverseAware: boolean,
  pass?: string,
): number {
  void def;
  return reverseAware && item.reverse_scored ? reverseValue(item, raw, pass) : raw;
}

/**
 * Score a complete response set against the definition.
 * Throws IncompleteResponsesError if any item in any pass is unanswered, so
 * partially saved instruments are never scored.
 */
export function scoreDefinition(def: InstrumentDefinition, responses: Response[]): Score[] {
  const missing = missingResponses(def, responses);
  if (missing.length > 0) throw new IncompleteResponsesError(def.key, missing);
  const idx = indexResponses(def, responses);
  const items = itemById(def);
  const scores: Score[] = [];
  for (const sub of def.scoring.subscales) {
    const pass = sub.pass ?? defaultPass(def);
    const reverseAware = sub.method.endsWith("_reverse_aware");
    let total = 0;
    for (const id of sub.items) {
      const item = items.get(id)!;
      const r = idx.get(responseKey(pass, id))!;
      total += scoredValue(def, item, r.value, reverseAware, pass);
    }
    const value = sub.method.startsWith("mean") ? total / sub.items.length : total;
    scores.push({
      instrument_key: def.key,
      subscale: sub.name,
      value,
      cutoff_label: cutoffLabel(def.scoring.cutoffs, sub.name, value),
      scoring_version: def.scoring.version,
      ...(def.unvalidated ? { unvalidated: true } : {}),
    });
  }
  return scores;
}

export type InstrumentModule = {
  definition: InstrumentDefinition;
  score: (responses: Response[]) => Score[];
};

export function defineInstrument(raw: unknown): InstrumentModule {
  const definition = parseDefinition(raw);
  return {
    definition,
    score: (responses: Response[]) => scoreDefinition(definition, responses),
  };
}
