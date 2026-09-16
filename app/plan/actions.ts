"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import type { PlanItem, ParentingLines } from "@/lib/data/brief_plan";
import { normalizeItems, validateForSave, type PlanIssue } from "@/lib/plan/rules";
import { DOMAINS } from "@/instruments/schema";
import { requirePartner } from "@/app/_lib/session";
import type { ActionResult } from "@/app/_lib/actions";

const Tag = z.enum(["requirement", "preference"]).nullable().optional();
const PlanItemZ = z.object({
  domain: z.enum(DOMAINS),
  topic: z.string().max(300),
  agreed: z.string().max(4000),
  a_does: z.string().max(2000),
  b_does: z.string().max(2000),
  revisit_date: z.string().max(10).nullable(),
  status: z.enum(["active", "parked", "closed"]),
  item_ref: z.string().max(200).optional(),
  a_tag: Tag,
  b_tag: Tag,
  pinned: z.boolean().optional(),
});
const LinesZ = z.object({
  children_questioning_adults: z.string().max(2000),
  who_corrects_and_how: z.string().max(2000),
  structure_vs_freedom: z.string().max(2000),
  language_and_modeling_standard: z.string().max(2000),
  adults_disagreeing_in_front_of_child: z.string().max(2000),
});
const Input = z.object({ items: z.array(PlanItemZ).max(500), parentingLines: LinesZ.nullable() });

export type SavePlanResult = ActionResult & { issues?: PlanIssue[]; version?: number };

/** Every save is a new version. Items are normalized (shared requirements pinned, no date) before the rules run. */
export async function savePlan(input: { items: PlanItem[]; parentingLines: ParentingLines | null }): Promise<SavePlanResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The plan could not be read. Check the fields and try again." };
  const user = await requirePartner();
  const items = normalizeItems(parsed.data.items);
  const issues = validateForSave(items);
  if (issues.length) return { ok: false, error: "A few things need fixing before this can be saved.", issues };
  const plan = await data.savePlanVersion({ coupleId: user.couple.id, createdBy: user.id, items, parentingLines: parsed.data.parentingLines });
  refresh();
  return { ok: true, message: `Saved as version ${plan.version}.`, version: plan.version };
}
