"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { keepOnly, PASTED_REGISTERS, splitSpeakers } from "@/lib/biographer/voice";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

const MAX_PER_REGISTER = 30;
const AddInput = z.object({ register: z.enum(PASTED_REGISTERS), text: z.string().trim().min(1).max(12000), speaker: z.string().trim().max(60).optional(), allMine: z.boolean().optional() });

/**
 * Keep a sample of how the person writes. The form drops the other person's side of a pasted
 * conversation in the browser; this checks again, so someone else's words are never stored.
 */
export async function addSample(raw: z.infer<typeof AddInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = AddInput.safeParse(raw);
  if (!parsed.success) return fail("Paste some text first, up to about 2,000 words.");
  const user = await requireAppUser();

  let text = parsed.data.text;
  const { speakers, format } = splitSpeakers(text);
  // Lines that merely start with a capitalized word and a colon may be the person's own notes; a chat export never is.
  if (speakers.length >= 2 && !(parsed.data.allMine && format === "names")) {
    if (!parsed.data.speaker || !speakers.includes(parsed.data.speaker)) return fail("This looks like a conversation. Say which of the names is you, so that only your side is kept.");
    text = keepOnly(text, parsed.data.speaker);
  }
  if (text.split(/\s+/).filter(Boolean).length < 5) return fail("That is too little to learn anything from. A few sentences or a handful of messages is enough.");

  const safety = screenText(text);
  if (safety) {
    await data.recordVoiceSafetyEvent({ userId: user.id, kind: safety });
    return fail(SAFETY_TEXT_MESSAGES[safety]);
  }
  const existing = await data.listVoiceSamples(user.id);
  if (existing.filter((s) => s.register === parsed.data.register).length >= MAX_PER_REGISTER) return fail("That is plenty for this kind of writing. Remove an older sample if you want to add this one.");

  await data.addVoiceSample({ userId: user.id, register: parsed.data.register, text });
  refresh();
  return { ok: true, message: "Kept. Your avatars will pick up how you write from it; nothing in it is treated as a fact about you." };
}

const RemoveInput = z.object({ sampleId: z.uuid() });

export async function removeSample(raw: z.infer<typeof RemoveInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = RemoveInput.safeParse(raw);
  if (!parsed.success) return fail("That sample could not be found.");
  const user = await requireAppUser();
  await data.removeVoiceSample({ sampleId: parsed.data.sampleId, userId: user.id });
  refresh();
  return { ok: true };
}
