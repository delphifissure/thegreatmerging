"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import extended from "@/config/extended.json";
import { appUrl, requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

const CAREGIVER_IDS = extended.caregiver.questions.map((q) => q.id);
const CHILD_IDS = extended.child.questions.map((q) => q.id);

export async function inviteCaregiver(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ email: z.email() }).safeParse({ email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) return fail("Enter the caregiver's email address.");
  const user = await requireAppUser();
  if (!user.couple || user.role !== "partner") return fail("Only a partner can invite a caregiver.");
  const { token } = await data.createInvitation({ coupleId: user.couple.id, invitedBy: user.id, email: parsed.data.email, role: "caregiver" });
  return { ok: true, message: `${appUrl()}/invite/${token}` };
}

export async function saveCaregiverAnswer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ questionId: z.enum(CAREGIVER_IDS as [string, ...string[]]), answer: z.string().trim().max(4000) }).safeParse({ questionId: formData.get("questionId"), answer: String(formData.get("answer") ?? "") });
  if (!parsed.success) return fail("That answer could not be saved.");
  const user = await requireAppUser();
  if (!user.couple) return fail("Join a couple first.");
  await data.writeCaregiverAnswer({ coupleId: user.couple.id, userId: user.id, questionId: parsed.data.questionId, answerText: parsed.data.answer || null });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function saveChildAnswer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ questionId: z.enum(CHILD_IDS as [string, ...string[]]), who: z.enum(["child", "adults"]), answer: z.string().trim().min(1).max(4000) })
    .safeParse({ questionId: formData.get("questionId"), who: formData.get("who"), answer: String(formData.get("answer") ?? "") });
  if (!parsed.success) return fail("Type the answer before saving.");
  const user = await requireAppUser();
  if (!user.couple || user.role !== "partner") return fail("Only a partner can record the conversation.");
  const q = extended.child.questions.find((x) => x.id === parsed.data.questionId)!;
  const pin = "pin_to_plan" in q && q.pin_to_plan === true;
  if (parsed.data.who === "adults" && !q.adults_answer_too) return fail("The adults do not answer this one.");
  await data.writeChildConversationAnswer({
    coupleId: user.couple.id,
    recordedBy: user.id,
    questionId: parsed.data.who === "adults" ? `${q.id}_adults` : q.id,
    answerText: parsed.data.answer,
    pinToPlan: pin,
  });
  refresh();
  return { ok: true, message: "Saved." };
}
