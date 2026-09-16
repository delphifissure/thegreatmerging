"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import * as data from "@/lib/data";
import { inngest } from "@/inngest/client";
import { isInstrumentKey } from "@/instruments/registry";
import { requirePartner } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

const Key = z.string().refine(isInstrumentKey, "unknown instrument");

const AnswerInput = z.object({
  instrumentKey: Key,
  itemId: z.string().min(1).max(60),
  pass: z.string().min(1).max(40),
  value: z.number().int(),
  needsContext: z.boolean(),
});

export type SaveResult = ActionResult & { safetyFlag?: boolean; safetyMessage?: string };
export type SaveAnswerInput = { instrumentKey: string; itemId: string; pass: string; value: number; needsContext: boolean };

export async function saveAnswer(input: SaveAnswerInput): Promise<SaveResult> {
  const parsed = AnswerInput.safeParse(input);
  if (!parsed.success) return fail("That answer could not be saved.");
  const user = await requirePartner();
  try {
    const r = await data.writeResponse({ userId: user.id, coupleId: user.couple.id, ...parsed.data });
    return r.safetyFlag ? { ok: true, safetyFlag: true, safetyMessage: r.safetyMessage } : { ok: true };
  } catch (err) {
    if (err instanceof data.ResponseWriteError) return fail("That value is outside the scale for this item.");
    return fail("Saving failed. Check your connection and try again.");
  }
}

const ContextInput = z.object({ instrumentKey: Key, itemId: z.string().min(1).max(60), needsContext: z.boolean() });

/** Re-writes every answered pass of the item with the new needs_context flag. */
export async function setNeedsContext(input: { instrumentKey: string; itemId: string; needsContext: boolean }): Promise<ActionResult> {
  const parsed = ContextInput.safeParse(input);
  if (!parsed.success) return fail("That flag could not be saved.");
  const user = await requirePartner();
  const responses = await data.listResponses(user.id, user.couple.id, parsed.data.instrumentKey);
  for (const r of responses) {
    if (r.item_id !== parsed.data.itemId) continue;
    await data.writeResponse({ userId: user.id, coupleId: user.couple.id, instrumentKey: parsed.data.instrumentKey, itemId: r.item_id, pass: r.pass, value: r.value, needsContext: parsed.data.needsContext });
  }
  return { ok: true };
}

const AttributionInput = z.object({ dimension: z.string().min(1).max(60), text: z.string().max(4000) });

export async function saveAttribution(input: { dimension: string; text: string }): Promise<ActionResult> {
  const parsed = AttributionInput.safeParse(input);
  if (!parsed.success) return fail("That note could not be saved.");
  const user = await requirePartner();
  try {
    await data.writePolarizationAttribution({ userId: user.id, coupleId: user.couple.id, dimension: parsed.data.dimension, attributionText: parsed.data.text.trim() || null });
    return { ok: true, message: "Saved." };
  } catch {
    return fail("Answer the three ratings for this dimension first, then add the note.");
  }
}

export async function finishInstrument(input: { instrumentKey: string }): Promise<ActionResult> {
  const parsed = z.object({ instrumentKey: Key }).safeParse(input);
  if (!parsed.success) return fail("Unknown instrument.");
  const user = await requirePartner();
  try {
    await data.markInstrumentComplete(user.id, user.couple.id, parsed.data.instrumentKey);
  } catch (err) {
    if (err instanceof data.ResponseWriteError) return fail("A few items are still unanswered. Use Back to find them.");
    return fail("Could not mark this instrument complete. Try again.");
  }
  const both = await data.coupleCompletionStatus(user.couple.id);
  if (both.both && !(await data.getLatestRun(user.couple.id))) {
    try {
      await inngest.send({ name: "couple/layers.completed", data: { coupleId: user.couple.id } });
    } catch {
      // The waiting room offers a retry when both are complete and no run exists.
    }
  }
  redirect("/instruments");
}
