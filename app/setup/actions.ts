"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import { appUrl, requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

export async function createCoupleAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ has_children: z.boolean() }).safeParse({ has_children: formData.get("has_children") === "on" });
  if (!parsed.success) return fail("Please check the form and try again.");
  const user = await requireAppUser();
  if (user.couple) return fail("You already belong to a couple.");
  await data.createCouple({ partnerAId: user.id, hasChildren: parsed.data.has_children });
  refresh();
  return { ok: true, message: "Couple created. Now invite your partner." };
}

export async function createInviteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ email: z.email() }).safeParse({ email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) return fail("Enter your partner's email address.");
  const user = await requireAppUser();
  if (!user.couple || user.side !== "a") return fail("Only the person who created the couple can send the invitation.");
  if (user.couple.partner_b_id) return fail("Your partner has already joined.");
  const { token } = await data.createInvitation({ coupleId: user.couple.id, invitedBy: user.id, email: parsed.data.email });
  return { ok: true, message: `${appUrl()}/invite/${token}` };
}

export async function updateNameAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ display_name: z.string().trim().min(1).max(80) }).safeParse({ display_name: formData.get("display_name") });
  if (!parsed.success) return fail("A name needs at least one character.");
  const user = await requireAppUser();
  await data.ensureUser({ id: user.id, displayName: parsed.data.display_name });
  refresh();
  return { ok: true, message: "Name saved." };
}

const ConsentField = z.enum([
  "share_relationship_scores",
  "share_mental_health_scores",
  "share_written_answers_verbatim",
  "allow_interpreter_to_quote_prior_answers",
  "share_profile_with_therapist",
]);

export async function updateConsentAction(input: { field: string; value: boolean }): Promise<ActionResult> {
  const parsed = z.object({ field: ConsentField, value: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Unknown setting.");
  const user = await requireAppUser();
  if (!user.couple) return fail("Create or join a couple first.");
  await data.updateConsent(user.id, user.couple.id, { [parsed.data.field]: parsed.data.value });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function updateTherapistEmailAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = String(formData.get("therapist_email") ?? "").trim();
  const parsed = z.union([z.literal(""), z.email()]).safeParse(raw);
  if (!parsed.success) return fail("That does not look like an email address.");
  const user = await requireAppUser();
  if (!user.couple) return fail("Create or join a couple first.");
  await data.updateConsent(user.id, user.couple.id, { therapist_email: parsed.data === "" ? null : parsed.data });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function updateHasChildrenAction(input: { has_children: boolean }): Promise<ActionResult> {
  const parsed = z.object({ has_children: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Unknown setting.");
  const user = await requireAppUser();
  if (!user.couple) return fail("Create or join a couple first.");
  await data.updateCouple(user.couple.id, { has_children: parsed.data.has_children });
  refresh();
  return { ok: true, message: "Saved." };
}
