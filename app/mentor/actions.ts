"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { callRole, configureLlm, MemoryMemo } from "@/lib/llm";
import { MentorReplySchema } from "@/lib/llm/schemas";
import { buildMentorInput, MENTOR_FALLBACK, mentorReadiness } from "@/lib/biographer/inputs";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { loadVoiceMaterial, voiceFor } from "@/app/_lib/voice";
import { fail, type ActionResult } from "@/app/_lib/actions";

const AskInput = z.object({ text: z.string().trim().min(1).max(4000) });

/** One rolling conversation per person. The avatar is rebuilt from the ratified lines on every turn, so an amendment takes effect at once. */
export async function askMentor(raw: z.infer<typeof AskInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = AskInput.safeParse(raw);
  if (!parsed.success) return fail("Write something first, then send.");
  const user = await requireAppUser();
  const entries = await data.listOwnEntries(user.id, { status: "ratified" });
  if (!mentorReadiness(entries).ready) return fail("There are not enough ratified lines yet to build this.");

  const threads = await data.listOwnThreads(user.id, "mentor");
  const thread = threads.find((t) => t.status === "open") ?? (await data.createThread({ userId: user.id, kind: "mentor", focus: null }));
  await data.appendTurn({ threadId: thread.id, userId: user.id, role: "person", text: parsed.data.text });

  const safety = screenText(parsed.data.text);
  if (safety) {
    await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text: SAFETY_TEXT_MESSAGES[safety], meta: { kind: "safety", safety } });
    await data.recordTextSafetyEvent({ userId: user.id, threadId: thread.id, kind: safety });
    refresh();
    return { ok: true };
  }

  if (!process.env.ANTHROPIC_API_KEY) return fail("Your message is saved, but the model is not configured.");
  // The last twenty turns keep the request small; the ratified lines carry the person, not the chat log.
  const turns = (await data.listTurns(thread.id, user.id)).filter((t) => t.role !== "guide").slice(-20);
  const built = buildMentorInput({ personName: user.displayName, entries, turns, voice: voiceFor(await loadVoiceMaterial(user.id), "mentor") });
  try {
    configureLlm({ recorder: new data.DbRecorder(), memo: new MemoryMemo() });
    const out = await callRole("mentor", built.input, MentorReplySchema, { coupleId: user.couple?.id ?? null, userId: user.id, jobStep: "mentor:turn" });
    const drawsOn = out.draws_on.map(built.entryIdOf).filter((id): id is string => id !== null);
    await data.appendTurn({ threadId: thread.id, userId: user.id, role: "avatar", text: out.reply.trim(), note: out.unsure ? (out.question_for_biographer ?? null) : null, meta: { draws_on: drawsOn, unsure: out.unsure } });
  } catch {
    await data.appendTurn({ threadId: thread.id, userId: user.id, role: "avatar", text: MENTOR_FALLBACK, meta: { draws_on: [], unsure: false, fallback: true } });
  }
  refresh();
  return { ok: true };
}

const RateInput = z.object({ turnId: z.uuid(), rating: z.enum(["like_me", "not_like_me"]) });

/** Whether it sounded like them. Asked apart from whether they would say it: a good voice makes wrong content persuasive. */
export async function rateReply(raw: z.infer<typeof RateInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = RateInput.safeParse(raw);
  if (!parsed.success) return fail("That reply could not be found.");
  const user = await requireAppUser();
  await data.rateTurn({ ...parsed.data, userId: user.id });
  refresh();
  return { ok: true };
}

const ContentInput = z.object({ turnId: z.uuid(), rating: z.enum(["would_say", "would_not_say"]) });

/** Whether they would say that, whatever it sounded like. */
export async function rateReplyContent(raw: z.infer<typeof ContentInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = ContentInput.safeParse(raw);
  if (!parsed.success) return fail("That reply could not be found.");
  const user = await requireAppUser();
  await data.rateTurnContent({ ...parsed.data, userId: user.id });
  refresh();
  return { ok: true };
}

const CorrectionInput = z.object({ turnId: z.uuid(), text: z.string().trim().max(2000) });

/**
 * "What would you have said?" The pair teaches the avatars how this person words things. It is
 * never treated as a fact about them: what is true of them changes only in their documents.
 */
export async function saveReplyCorrection(raw: z.infer<typeof CorrectionInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = CorrectionInput.safeParse(raw);
  if (!parsed.success) return fail("Keep it under 2,000 characters.");
  const user = await requireAppUser();
  const safety = screenText(parsed.data.text);
  if (safety) {
    await data.recordVoiceSafetyEvent({ userId: user.id, kind: safety });
    return fail(SAFETY_TEXT_MESSAGES[safety]);
  }
  await data.saveCorrection({ turnId: parsed.data.turnId, userId: user.id, text: parsed.data.text });
  refresh();
  return { ok: true, message: parsed.data.text ? "Saved. Your avatars will learn from how you put it." : "Removed." };
}
