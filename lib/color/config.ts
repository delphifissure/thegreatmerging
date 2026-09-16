/** Loader for config/color_modules/<domain>.json, validated once. */
import { z } from "zod";
import parenting from "@/config/color_modules/parenting.json";
import intimacy from "@/config/color_modules/intimacy.json";
import communication from "@/config/color_modules/communication.json";
import conflict from "@/config/color_modules/conflict.json";
import household from "@/config/color_modules/household.json";
import self_care from "@/config/color_modules/self_care.json";
import social_family_longterm from "@/config/color_modules/social_family_longterm.json";
import { DomainSchema, type Domain } from "@/instruments/schema";
import type { ColorModuleConfig } from "./machine";

const Question = z.object({ id: z.string().min(1), text: z.string().min(1), group: z.string().optional(), condition: z.string().optional() });
const Tag = z.object({ id: z.string().min(1), topics: z.array(z.string().min(1)).min(1), group: z.string().optional(), condition: z.string().optional() });

export const ColorModuleSchema = z.object({
  domain: DomainSchema,
  title: z.string().min(1),
  version: z.string().min(1),
  source: z.string().optional(),
  opens_on: z.string().optional(),
  groups: z.record(z.string(), z.string()).optional(),
  specifics: z.array(Question).min(1),
  preference: z.array(Question).min(1),
  tags: z.array(Tag).min(1),
  common: z.object({
    preference_universal: z.string().min(1),
    tag_question: z.string().min(1),
    tag_comment_prompt: z.string().min(1),
    perception_gap: z.string().min(1),
    context: z.string().min(1),
    polarization: z.string().min(1),
    concreteness_followup: z.string().min(1),
    probe_skip_label: z.string().min(1),
    transitions: z.record(z.string(), z.string()),
  }),
});

const RAW: Record<Domain, unknown> = { parenting, intimacy, communication, conflict, household, self_care, social_family_longterm };

const cache = new Map<Domain, ColorModuleConfig>();

export function loadColorModule(domain: Domain): ColorModuleConfig {
  const hit = cache.get(domain);
  if (hit) return hit;
  const parsed = ColorModuleSchema.safeParse(RAW[domain]);
  if (!parsed.success) throw new Error(`color module ${domain}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  cache.set(domain, parsed.data as ColorModuleConfig);
  return parsed.data as ColorModuleConfig;
}

export function allColorModules(): ColorModuleConfig[] {
  return (Object.keys(RAW) as Domain[]).map(loadColorModule);
}
