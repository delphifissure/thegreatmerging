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
