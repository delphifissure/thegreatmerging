"use server";

import { refresh } from "next/cache";
import * as data from "@/lib/data";
import { inngest } from "@/inngest/client";
import { requirePartner } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

/** Retry path: send couple/layers.completed when both are done and no run exists yet. */
export async function startInterpretation(): Promise<ActionResult> {
  const user = await requirePartner();
  const both = await data.coupleCompletionStatus(user.couple.id);
  if (!both.both) return fail("Both of you need to finish every required instrument first.");
  const run = await data.getLatestRun(user.couple.id);
  if (run && run.status !== "failed") return fail("Interpretation is already underway.");
  try {
    await inngest.send({ name: "couple/layers.completed", data: { coupleId: user.couple.id } });
  } catch {
    return fail("The interpretation job could not be started. Try again in a minute.");
  }
  refresh();
  return { ok: true, message: "Interpretation started." };
}
