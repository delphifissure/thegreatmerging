"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import * as data from "@/lib/data";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

const Input = z.object({ token: z.string().min(16).max(200) });

export async function acceptInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = Input.safeParse({ token: formData.get("token") });
  if (!parsed.success) return fail("This invitation link is not valid.");
  const user = await requireAppUser();
  try {
    await data.acceptInvitation({ token: parsed.data.token, userId: user.id });
  } catch (err) {
    if (err instanceof data.InvitationError) return fail(`This invitation cannot be accepted: ${err.message}.`);
    return fail("Something went wrong accepting the invitation. Try again.");
  }
  redirect("/setup");
}
