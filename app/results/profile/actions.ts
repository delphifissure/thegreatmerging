"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import { inngest } from "@/inngest/client";
import { appUrl, requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

export async function createShare(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ email: z.email(), confirmed: z.literal("yes") }).safeParse({ email: String(formData.get("email") ?? "").trim(), confirmed: formData.get("confirmed") });
  if (!parsed.success) return fail("Enter the therapist's email and confirm.");
  const user = await requireAppUser();
  const profile = await data.getProfile(user.id);
  if (!profile?.content) return fail("There is no profile to share yet.");
  const { token } = await data.createTherapistShare({ userId: user.id, coupleId: user.couple?.id ?? null, email: parsed.data.email });
  refresh();
  return { ok: true, message: `${appUrl()}/share/${token}` };
}

export async function revokeShare(formData: FormData): Promise<void> {
  const parsed = z.object({ shareId: z.uuid() }).safeParse({ shareId: formData.get("shareId") });
  if (!parsed.success) return;
  const user = await requireAppUser();
  await data.revokeTherapistShare({ shareId: parsed.data.shareId, userId: user.id });
  refresh();
}

export async function dismissSafetyNote(): Promise<void> {
  const user = await requireAppUser();
  await data.clearSafetyNote(user.id);
  refresh();
}

const ExportInput = z.object({ kind: z.enum(["brief", "plan", "profile"]), format: z.enum(["md", "pdf"]) });

export async function requestExport(input: z.infer<typeof ExportInput>): Promise<ActionResult> {
  const parsed = ExportInput.safeParse(input);
  if (!parsed.success) return fail("Unknown export.");
  const user = await requireAppUser();
  if (parsed.data.kind !== "profile" && !user.couple) return fail("Create or join a couple first.");
  try {
    await inngest.send({ name: "export/requested", data: { coupleId: parsed.data.kind === "profile" ? null : user.couple!.id, userId: user.id, kind: parsed.data.kind, format: parsed.data.format } });
  } catch {
    return fail("The export could not be requested. Try again in a minute.");
  }
  return { ok: true, message: `Export requested (${parsed.data.kind}, ${parsed.data.format.toUpperCase()}). It appears below when ready; use Check again.` };
}
