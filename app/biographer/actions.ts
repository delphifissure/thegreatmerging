"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { callRole, configureLlm, MemoryMemo } from "@/lib/llm";
import { BiographerTurnSchema, DrafterOutputSchema } from "@/lib/llm/schemas";
import { BIOGRAPHER_FALLBACK, buildBiographerInput, buildDrafterInput, cleanReferences, entriesFromDraft, focusByKey } from "@/lib/biographer/inputs";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

/** Usage rows go to the database; outputs are never memoized there, because they echo what a person wrote. */
function configurePrivateLlm() {
  configureLlm({ recorder: new data.DbRecorder(), memo: new MemoryMemo() });
}

export async function startThread(formData: FormData) {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const focus = focusByKey(String(formData.get("focus") ?? ""));
  if (!focus) notFound();
  const thread = await data.createThread({ userId: user.id, kind: "biographer", focus: focus.key });
  await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text: focus.opening, note: "Every session on this topic starts from the same opening question. Everything after it follows what you say.", meta: { kind: "open" } });
  redirect(`/biographer/${thread.id}`);
}

const MessageInput = z.object({ threadId: z.uuid(), text: z.string().trim().min(1).max(8000) });

export async function sendMessage(raw: z.infer<typeof MessageInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = MessageInput.safeParse(raw);
  if (!parsed.success) return fail("Write something first, then send.");
  const user = await requireAppUser();
  const thread = await data.getOwnThread(parsed.data.threadId, user.id);
  if (!thread || thread.kind !== "biographer") return fail("This conversation is not yours.");
  if (thread.status !== "open") return fail("This conversation is finished. Start a new one to go on.");
  const focus = focusByKey(thread.focus);
  if (!focus) return fail("This conversation's topic no longer exists.");

  await data.appendTurn({ threadId: thread.id, userId: user.id, role: "person", text: parsed.data.text });

  const safety = screenText(parsed.data.text);
  if (safety) {
    await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text: SAFETY_TEXT_MESSAGES[safety], meta: { kind: "safety", safety } });
    await data.recordTextSafetyEvent({ userId: user.id, threadId: thread.id, kind: safety });
    refresh();
    return { ok: true };
  }

  if (!process.env.ANTHROPIC_API_KEY) return fail("Your answer is saved, but the model is not configured, so there is no next question.");
  const [turns, entries, openQuestions] = await Promise.all([data.listTurns(thread.id, user.id), data.listOwnEntries(user.id, { status: "ratified" }), data.listOpenQuestions(user.id)]);
  let next: { reflection: string; question: string; why: string; kind: string; references: number[]; suggest_stopping: boolean };
  try {
    configurePrivateLlm();
    const out = await callRole("biographer", buildBiographerInput({ personName: user.displayName, focus, turns, entries, openQuestions }), BiographerTurnSchema, { coupleId: user.couple?.id ?? null, userId: user.id, jobStep: "biographer:turn" });
    next = { ...out, references: cleanReferences(out, turns) };
  } catch {
    next = { ...BIOGRAPHER_FALLBACK, references: [], suggest_stopping: false };
  }
  const text = [next.reflection.trim(), next.question.trim()].filter(Boolean).join("\n\n");
  await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text, note: next.why, meta: { kind: next.kind, references: next.references, suggest_stopping: next.suggest_stopping } });
  refresh();
  return { ok: true };
}

/** Close the conversation and ask the drafter for lines to ratify. The person decides about every one. */
export async function finishThread(formData: FormData) {
  if (!FEATURES.biographer) notFound();
  const user = await requireAppUser();
  const threadId = z.uuid().safeParse(String(formData.get("threadId") ?? ""));
  if (!threadId.success) notFound();
  const thread = await data.getOwnThread(threadId.data, user.id);
  if (!thread || thread.kind !== "biographer") notFound();
  const focus = focusByKey(thread.focus);
  const turns = await data.listTurns(thread.id, user.id);
  const said = turns.filter((t) => t.role === "person").length;
  let drafted = false;
  if (focus && said >= 2 && !thread.drafted_at && process.env.ANTHROPIC_API_KEY) {
    try {
      configurePrivateLlm();
      const entries = await data.listOwnEntries(user.id, { status: "ratified" });
      const out = await callRole("drafter", buildDrafterInput({ personName: user.displayName, focus, turns, entries }), DrafterOutputSchema, { coupleId: user.couple?.id ?? null, userId: user.id, jobStep: "biographer:draft" });
      await data.proposeEntries({ userId: user.id, threadId: thread.id, entries: entriesFromDraft(out, turns) });
      drafted = true;
    } catch {
      drafted = false;
    }
  }
  await data.closeThread({ threadId: thread.id, userId: user.id, drafted });
  redirect(drafted ? "/documents?drafted=1" : "/documents?drafted=0");
}
