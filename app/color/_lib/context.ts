/**
 * Server-side helpers for the color layer: which domains flagged for this couple (from the
 * user's private results) and the InitContext for one domain, built only from this user's own
 * material (their needs_context flags, their perception gaps, their polarization ratings).
 */
import { z } from "zod";
import flagRules from "@/config/flag_rules.json";
import * as data from "@/lib/data";
import type { InitContext, MachineState } from "@/lib/color/machine";
import { INSTRUMENTS } from "@/instruments/registry";
import type { Domain } from "@/instruments/schema";
import { parsePrivateResults } from "@/app/_lib/results";

export type FlaggedDomain = { domain: Domain; weight: number; flag_count: number };

export async function flaggedDomainsFor(userId: string, coupleId: string): Promise<FlaggedDomain[]> {
  const row = await data.getPrivateResults(userId, coupleId);
  const parsed = row ? parsePrivateResults(row.content) : null;
  return [...(parsed?.flagged_domains ?? [])].sort((x, y) => y.weight - x.weight);
}

const TriggeredBy = z.object({
  instrument: z.string(),
  item: z.string().optional(),
  descriptor: z.string().optional(),
  user: z.enum(["a", "b", "both"]).optional(),
  values: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
});

export async function buildInitContext(input: { userId: string; coupleId: string; side: "a" | "b"; domain: Domain }): Promise<InitContext> {
  const { userId, coupleId, side, domain } = input;

  const needs_context_items: InitContext["needs_context_items"] = [];
  for (const f of await data.getFlags(coupleId)) {
    if (f.domain !== domain || f.rule_key !== "needs_context") continue;
    const t = TriggeredBy.safeParse(f.triggered_by);
    if (!t.success || t.data.user !== side || !t.data.item) continue;
    const value = t.data.values.value;
    const pass = t.data.values.pass;
    needs_context_items.push({
      item_ref: t.data.item,
      descriptor: t.data.descriptor ?? t.data.item,
      value: typeof value === "number" ? value : 0,
      ...(typeof pass === "string" ? { pass } : {}),
    });
  }

  const results = await data.getPrivateResults(userId, coupleId);
  const parsed = results ? parsePrivateResults(results.content) : null;
  const perception_gaps: InitContext["perception_gaps"] = (parsed?.perception_gaps ?? [])
    .filter((g) => g.domain === domain)
    .map((g) => ({ item_ref: g.item_ref, descriptor: g.descriptor, self_value: g.self_value, partner_value: g.partner_value }));

  const threshold = flagRules.rules.polarization_loop.gap_abs_at_or_above;
  const polarization_gaps: InitContext["polarization_gaps"] = [];
  const responses = await data.listResponses(userId, coupleId, "polarization");
  for (const item of INSTRUMENTS.polarization.definition.items) {
    if (item.domain !== domain) continue;
    const alone = responses.find((r) => r.item_id === item.item_id && r.pass === "self_alone")?.value;
    const withPartner = responses.find((r) => r.item_id === item.item_id && r.pass === "self_with_partner")?.value;
    if (alone === undefined || withPartner === undefined) continue;
    if (Math.abs(withPartner - alone) >= threshold) polarization_gaps.push({ item_ref: item.item_id, descriptor: item.descriptor, self_alone: alone, self_with_partner: withPartner });
  }

  const members = await data.listCoupleMembers(coupleId);
  const multi_caregiver = members.some((m) => m.role === "caregiver");

  return { needs_context_items, perception_gaps, polarization_gaps, multi_caregiver };
}

export function sessionState(session: { state: unknown }): MachineState {
  return session.state as MachineState;
}
