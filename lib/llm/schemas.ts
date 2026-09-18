/**
 * Output schemas for every LLM role. Each is the input_schema of the forced tool and the
 * Zod validator applied to the tool input. Schemas are strict-compatible: every field is
 * required (use nullable instead of optional) and objects reject unknown keys.
 */
import { z } from "zod";
import probeTemplates from "@/config/probe_templates.json";
import { DOMAINS } from "@/instruments/schema";

export const DomainEnum = z.enum(DOMAINS);

const Sentence = z.string().min(1).max(600);

export const InterpretedItem = z.object({
  item: z.string().min(1).max(200),
  one_sentence: Sentence,
});

export const FlaggedItem = z.object({
  item: z.string().min(1).max(200),
  plain_reason: Sentence,
  weight: z.number().int().min(1).max(10),
});

export const DomainInterpretationSchema = z.object({
  domain: DomainEnum,
  aligned: z.array(InterpretedItem).max(60),
  low_intensity_misaligned: z.array(InterpretedItem).max(60),
  flagged: z.array(FlaggedItem).max(100),
});

export const PrivateSummarySchema = z.object({
  user: z.enum(["a", "b"]),
  sentences: z.array(
    z.object({
      instrument_key: z.string().min(1).max(40),
      /** One plain sentence with the cutoff named, or "no published cutoff". */
      sentence: Sentence,
    }),
  ),
});

export const InterpreterOutputSchema = z.object({
  /** Exactly one sentence when distress_context is true, otherwise null. */
  distress_note: z.string().max(400).nullable(),
  domains: z.array(DomainInterpretationSchema).max(7),
  private_summaries: z.array(PrivateSummarySchema).length(2),
});
export type InterpreterOutput = z.infer<typeof InterpreterOutputSchema>;

const templateById = new Map(probeTemplates.templates.map((t) => [t.id, new RegExp(t.pattern, "s")]));

export const ProbeSchema = z
  .object({
    template_id: z.number().int().min(1).max(7),
    question_text: z.string().min(1).max(600),
    reason_text: z.string().min(1).max(600),
    references: z.array(z.string().min(1).max(120)).max(10),
  })
  .refine((p) => templateById.get(p.template_id)?.test(p.question_text.trim()) ?? false, {
    message: "question_text must match the wording of the referenced template exactly (slots filled, nothing else changed)",
    path: ["question_text"],
  });

export const ProberOutputSchema = z.object({
  probes: z.array(ProbeSchema).max(probeTemplates.max_probes_per_domain),
});
export type ProberOutput = z.infer<typeof ProberOutputSchema>;

const TagKind = z.enum(["requirement", "preference"]);

export const BriefDomainSchema = z.object({
  domain: DomainEnum,
  what_each_would_do: z.object({ a: Sentence.max(1200), b: Sentence.max(1200) }),
  values_underneath: z.object({ a: Sentence.max(1200), b: Sentence.max(1200) }),
  tags_side_by_side: z.array(
    z.object({
      item_ref: z.string().min(1).max(200),
      a_tag: TagKind.nullable(),
      a_comment: z.string().max(1200).nullable(),
      b_tag: TagKind.nullable(),
      b_comment: z.string().max(1200).nullable(),
    }),
  ),
  perception_gaps: z.array(
    z.object({
      item_ref: z.string().min(1).max(200),
      a_explanation: z.string().max(1200),
      b_explanation: z.string().max(1200),
    }),
  ),
  polarization_loops: z.array(
    z.object({
      dimension: z.string().min(1).max(200),
      /** Framed as a shared pattern, never as two faults. Must contain the word "unvalidated". */
      shared_pattern: z.string().min(1).max(800),
      unvalidated: z.literal(true),
    }),
  ),
  consistency_notes: z.array(z.object({ user: z.enum(["a", "b"]), note: z.string().min(1).max(800) })),
  aligned_items: z.array(z.string().min(1).max(200)),
  parked_items: z.array(z.string().min(1).max(200)),
});
export type BriefDomain = z.infer<typeof BriefDomainSchema>;

export const SummarizerOutputSchema = z.object({ brief: BriefDomainSchema });
export type SummarizerOutput = z.infer<typeof SummarizerOutputSchema>;

export const SentimentMarker = z.enum([
  "contempt",
  "criticism",
  "defensiveness",
  "stonewalling",
  "negative_sentiment_override",
]);

export const SentimentFlaggerOutputSchema = z.object({
  flags: z.array(
    z.object({
      marker: SentimentMarker,
      /** Visible to the clinician only. */
      quoted_span: z.string().min(1).max(600),
      confidence: z.number().min(0).max(1),
      source_answer_id: z.string().min(1).max(80),
    }),
  ),
});
export type SentimentFlaggerOutput = z.infer<typeof SentimentFlaggerOutputSchema>;

export const GuardrailOutputSchema = z.object({
  contains_verdict_or_diagnosis: z.boolean(),
  reason: z.string().max(600),
});
export type GuardrailOutput = z.infer<typeof GuardrailOutputSchema>;

export const ConcretenessOutputSchema = z.object({ concrete: z.boolean() });
export type ConcretenessOutput = z.infer<typeof ConcretenessOutputSchema>;

export const ROLE_SCHEMAS = {
  interpreter: InterpreterOutputSchema,
  prober: ProberOutputSchema,
  summarizer: SummarizerOutputSchema,
  sentiment_flagger: SentimentFlaggerOutputSchema,
  guardrail: GuardrailOutputSchema,
  concreteness: ConcretenessOutputSchema,
} as const;

// ---------------------------------------------------------------------------------------------
// Intervention prototype (docs/concept_intervention.md): biographer, drafter, one-notch-ahead self.
// ---------------------------------------------------------------------------------------------

export const HISTORY_SECTIONS = ["family", "earlier_relationships", "money_modelled", "conflict_modelled", "turning_points", "now"] as const;
export const CONSTITUTION_SECTIONS = ["values", "lived", "gaps", "requirements", "preferences", "conflict", "fears", "working_on"] as const;
export const DOCUMENT_SECTIONS = [...HISTORY_SECTIONS, ...CONSTITUTION_SECTIONS] as const;
export type DocumentKind = "history" | "constitution";
export type DocumentSection = (typeof DOCUMENT_SECTIONS)[number];

export function sectionBelongsTo(document: DocumentKind, section: string): boolean {
  return document === "history" ? (HISTORY_SECTIONS as readonly string[]).includes(section) : (CONSTITUTION_SECTIONS as readonly string[]).includes(section);
}

/** Tool-call markup sometimes leaks into a string field; text shown to a person must never carry it. */
const LEAKED_MARKUP = /<\/?\s*(parameter|invoke|reply|question|reflection|function_calls|antml)[\s>:]/i;
const Prose = (max: number, min = 1) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((t) => !LEAKED_MARKUP.test(t), { message: "contains tool-call markup; put each value in its own field and write plain prose" });

/** One biographer turn: an optional reflection, exactly one question, and the honest reason for it. */
export const BiographerTurnSchema = z
  .object({
    reflection: Prose(500, 0),
    question: Prose(500),
    why: Prose(400),
    kind: z.enum(["open", "follow_up", "discrepancy", "wrap_up"]),
    references: z.array(z.string().min(1).max(40)).max(6),
    suggest_stopping: z.boolean(),
  })
  .superRefine((t, ctx) => {
    // Placing two things side by side needs two things.
    if (t.kind === "discrepancy" && t.references.length < 2) ctx.addIssue({ code: "custom", path: ["references"], message: "a discrepancy question must reference the two turns it places side by side" });
  });
export type BiographerTurn = z.infer<typeof BiographerTurnSchema>;

export const DrafterOutputSchema = z
  .object({
    entries: z
      .array(
        z.object({
          document: z.enum(["history", "constitution"]),
          section: z.enum(DOCUMENT_SECTIONS),
          text: Prose(600),
          in_their_words: z.boolean(),
          source_turn_ids: z.array(z.string().min(1).max(40)).min(1).max(8),
          suggested_mark: z.enum(["settled", "open"]),
        }),
      )
      .max(20),
  })
  .superRefine((o, ctx) => {
    o.entries.forEach((e, i) => {
      if (!sectionBelongsTo(e.document, e.section)) ctx.addIssue({ code: "custom", path: ["entries", i, "section"], message: `${e.section} is not a section of the ${e.document}` });
    });
  });
export type DrafterOutput = z.infer<typeof DrafterOutputSchema>;

export const MentorReplySchema = z
  .object({
    reply: Prose(1500),
    draws_on: z.array(z.string().min(1).max(40)).max(8),
    unsure: z.boolean(),
    question_for_biographer: z.string().max(400).nullable(),
  })
  .superRefine((r, ctx) => {
    if (r.unsure && !r.question_for_biographer?.trim()) ctx.addIssue({ code: "custom", path: ["question_for_biographer"], message: "when unsure, give the one question the biographer should ask" });
  });
export type MentorReply = z.infer<typeof MentorReplySchema>;
