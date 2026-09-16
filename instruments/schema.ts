/**
 * Zod schemas for instrument configuration files (config/instruments/*.json)
 * and for the scoring contract shared by every instrument module.
 *
 * Principle 1: scoring is code. These schemas describe the published scoring key
 * (item membership, reverse scoring, aggregation method, cutoffs). Item text is
 * populated by the project owner from the official source; the repo ships with
 * `text` set to "TODO: populate from source" and a test that fails while any remain.
 */
import { z } from "zod";

export const DOMAINS = [
  "parenting",
  "intimacy",
  "communication",
  "conflict",
  "household",
  "self_care",
  "social_family_longterm",
] as const;
export const DomainSchema = z.enum(DOMAINS);
export type Domain = z.infer<typeof DomainSchema>;

export const TODO_TEXT = "TODO: populate from source";

export const ScaleSchema = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
    /** Optional anchor labels, index 0 = min. Shown to the person and read by screen readers. */
    labels: z.array(z.string()).optional(),
  })
  .refine((s) => s.max > s.min, { message: "scale.max must be greater than scale.min" });

export const ItemSchema = z.object({
  item_id: z.string().min(1),
  /** Official item wording. Populated by the owner; never hardcoded from memory. */
  text: z.string(),
  /**
   * Short neutral topic label used in prompts and logs in place of item text
   * (LLM cost control 3: prompts carry item IDs and descriptors, never instrument text).
   */
  descriptor: z.string().min(1),
  scale: ScaleSchema,
  /** Per-pass scale override for instruments whose passes use different scales (FAPBI frequency vs acceptability). */
  scale_by_pass: z.record(z.string(), ScaleSchema).optional(),
  reverse_scored: z.boolean().default(false),
  /** Domain this item routes to when it triggers a flag. Falls back to the instrument's default_domain. */
  domain: DomainSchema.optional(),
  /** True only for PHQ-9 item 9. Handled specially in lib/data and excluded from couple-level computation. */
  safety_item: z.boolean().default(false),
  /** Optional presentation grouping (e.g. Who Does What: household_tasks | decisions | childcare). */
  group: z.string().optional(),
  /** The official form prints this item's scoring values from high to low (left to right); render it as printed. */
  printed_descending: z.boolean().optional(),
  /** Bipolar adjective item: the left and right poles as printed. Values are stored as the printed scoring value. */
  bipolar: z.object({ left: z.string(), right: z.string() }).optional(),
});

export const ScoringMethodSchema = z.enum(["sum", "mean", "sum_reverse_aware", "mean_reverse_aware"]);

export const SubscaleSchema = z.object({
  name: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
  method: ScoringMethodSchema,
  /** Which pass to score for multi-pass instruments. Defaults to the first pass. */
  pass: z.string().optional(),
});

export const CutoffSchema = z
  .object({
    subscale: z.string().min(1),
    label: z.string().min(1),
    below: z.number().optional(),
    at_or_below: z.number().optional(),
    above: z.number().optional(),
    at_or_above: z.number().optional(),
  })
  .refine(
    (c) => c.below !== undefined || c.at_or_below !== undefined || c.above !== undefined || c.at_or_above !== undefined,
    { message: "a cutoff needs at least one bound" },
  );

export const InstrumentDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    source_citation: z.string().min(1),
    /** The loader refuses any instrument whose license note is empty. */
    license_note: z.string().min(1, "license_note must not be empty"),
    layer: z.union([z.literal(0), z.literal(1)]),
    passes: z.array(z.string().min(1)).min(1),
    /** Original, unvalidated instruments (the polarization block) carry this label into every output. */
    unvalidated: z.boolean().default(false),
    /** PHQ-9, GAD-7, OCI-R: values and scores are encrypted at rest and gated by share_mental_health_scores. */
    mental_health: z.boolean().default(false),
    default_domain: DomainSchema.optional(),
    items: z.array(ItemSchema).min(1, "items must not be empty"),
    scoring: z.object({
      version: z.string().default("1.0.0"),
      subscales: z.array(SubscaleSchema).default([]),
      cutoffs: z.array(CutoffSchema).default([]),
    }),
    /** Set to true by the owner after checking the key against the published source. */
    scoring_key_verified: z.boolean().default(false),
    notes: z.string().optional(),
    /** Where the item text and scoring key were taken from (URL or citation), recorded when populated. */
    source_url: z.string().optional(),
    text_source: z.string().optional(),
    /** Terms under which the text may be used, as stated by the source. */
    license_url: z.string().optional(),
    /** Display prompt per pass for multi-pass instruments (shown above the item's scale for that pass). */
    pass_prompts: z.record(z.string(), z.string()).optional(),
    /** Polarization only: the written attribution question asked in the color layer when two self ratings differ. */
    attribution_prompt: z.string().optional(),
    attribution_gap_at_or_above: z.number().optional(),
  })
  .superRefine((def, ctx) => {
    const ids = new Set<string>();
    for (const item of def.items) {
      if (ids.has(item.item_id)) {
        ctx.addIssue({ code: "custom", message: `duplicate item_id ${item.item_id}` });
      }
      ids.add(item.item_id);
    }
    for (const sub of def.scoring.subscales) {
      for (const id of sub.items) {
        if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `subscale ${sub.name} references unknown item ${id}` });
      }
      if (sub.pass && !def.passes.includes(sub.pass)) {
        ctx.addIssue({ code: "custom", message: `subscale ${sub.name} references unknown pass ${sub.pass}` });
      }
    }
    const subNames = new Set(def.scoring.subscales.map((s) => s.name));
    for (const c of def.scoring.cutoffs) {
      if (!subNames.has(c.subscale)) ctx.addIssue({ code: "custom", message: `cutoff references unknown subscale ${c.subscale}` });
    }
  });

export type InstrumentDefinition = z.infer<typeof InstrumentDefinitionSchema>;
export type InstrumentItem = z.infer<typeof ItemSchema>;
export type Subscale = z.infer<typeof SubscaleSchema>;
export type Cutoff = z.infer<typeof CutoffSchema>;

/** One answered item. `pass` defaults to the instrument's first pass. */
export const ResponseSchema = z.object({
  item_id: z.string().min(1),
  value: z.number(),
  pass: z.string().min(1).optional(),
  needs_context: z.boolean().optional(),
});
export type Response = z.infer<typeof ResponseSchema>;

export const ScoreSchema = z.object({
  instrument_key: z.string(),
  subscale: z.string(),
  value: z.number(),
  cutoff_label: z.string().nullable(),
  scoring_version: z.string(),
  /** Carried on every output that references an unvalidated instrument. */
  unvalidated: z.boolean().optional(),
});
export type Score = z.infer<typeof ScoreSchema>;

/** Per-item derived quantity (a desired-change value, a now-vs-ideal gap, a polarization gap). */
export type DerivedMetric = {
  instrument_key: string;
  metric: string;
  item_id: string;
  value: number;
  unvalidated?: boolean;
};
