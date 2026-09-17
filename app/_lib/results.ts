/** Zod views of JSON content stored by the jobs, so pages render only what lib/data returns. */
import { z } from "zod";
import { DOMAINS } from "@/instruments/schema";

export const DomainZ = z.enum(DOMAINS);

export const PrivateResultsSchema = z.object({
  sentences: z.array(z.object({ instrument_key: z.string(), sentence: z.string() })).default([]),
  distress_note: z.string().nullable().default(null),
  flagged_domains: z.array(z.object({ domain: DomainZ, weight: z.number(), flag_count: z.number() })).default([]),
  perception_gaps: z
    .array(
      z.object({
        instrument: z.string(),
        item_ref: z.string(),
        descriptor: z.string(),
        domain: DomainZ,
        self_value: z.number(),
        partner_value: z.number(),
        gap: z.number(),
        unvalidated: z.boolean().optional(),
      }),
    )
    .default([]),
  generated_label: z.string().default("The sentences above were written by the app from your answers, with the scores taken from the questionnaires. Not a validated result."),
});
export type PrivateResults = z.infer<typeof PrivateResultsSchema>;

export function parsePrivateResults(content: unknown): PrivateResults | null {
  const r = PrivateResultsSchema.safeParse(content);
  return r.success ? r.data : null;
}

export const ProfileContentSchema = z.object({
  labels: z.object({ validated: z.string(), generated: z.string() }),
  generated_at: z.string(),
  validated_scores: z.array(
    z.object({
      instrument_key: z.string(),
      name: z.string(),
      source_citation: z.string(),
      license_note: z.string(),
      subscale: z.string(),
      value: z.number(),
      cutoff_label: z.string().nullable(),
      unvalidated: z.boolean(),
    }),
  ),
  generated_sentences: z.array(z.object({ instrument_key: z.string(), sentence: z.string() })),
  tags: z.array(z.object({ domain: z.string(), item_ref: z.string(), tag: z.enum(["requirement", "preference"]), comment: z.string() })),
  contains_partner_data: z.literal(false),
});
export type ProfileView = z.infer<typeof ProfileContentSchema>;

export function parseProfile(content: unknown): ProfileView | null {
  const r = ProfileContentSchema.safeParse(content);
  return r.success ? r.data : null;
}

export { DOMAIN_TITLES } from "@/lib/copy";
