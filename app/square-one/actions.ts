"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import squareOne from "@/config/square_one.json";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

export async function saveRequirements(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const items = Array.from({ length: squareOne.requirements_count }, (_, i) => String(formData.get(`req_${i}`) ?? "").trim());
  const parsed = z.array(z.string().max(300)).length(squareOne.requirements_count).safeParse(items);
  if (!parsed.success) return fail("Each requirement is at most 300 characters.");
  const user = await requireAppUser();
  await data.saveSquareOneRequirements(user.id, parsed.data);
  refresh();
  return { ok: true, message: "Requirements saved." };
}

const NoteInput = z.object({ questionIndex: z.number().int().min(1).max(200), notes: z.string().max(4000), raisedEyebrow: z.boolean() });

export async function saveNote(input: z.infer<typeof NoteInput>): Promise<ActionResult> {
  const parsed = NoteInput.safeParse(input);
  if (!parsed.success) return fail("That note could not be saved.");
  const user = await requireAppUser();
  await data.saveSquareOneNote({ userId: user.id, questionIndex: parsed.data.questionIndex, notes: parsed.data.notes.trim() || null, raisedEyebrow: parsed.data.raisedEyebrow });
  return { ok: true };
}
