"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import { requirePartner } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

const Input = z.object({ revisitId: z.uuid(), outcome: z.enum(["still_true", "changed", "removed"]), notes: z.string().trim().max(2000) });

export async function completeRevisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = Input.safeParse({ revisitId: formData.get("revisitId"), outcome: formData.get("outcome"), notes: String(formData.get("notes") ?? "") });
  if (!parsed.success) return fail("Choose one of the three answers.");
  const user = await requirePartner();
  const known = (await data.listRevisits(user.couple.id)).some((r) => r.id === parsed.data.revisitId);
  if (!known) return fail("That revisit is not on your current plan.");
  await data.completeRevisit({ revisitId: parsed.data.revisitId, userId: user.id, outcome: parsed.data.outcome, notes: parsed.data.notes || null });
  refresh();
  return { ok: true, message: "Recorded." };
}
