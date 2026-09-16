"use server";

import { refresh } from "next/cache";
import * as data from "@/lib/data";
import { requirePartner } from "@/app/_lib/session";
import type { ActionResult } from "@/app/_lib/actions";

export async function markViewed(): Promise<ActionResult> {
  const user = await requirePartner();
  await data.markPrivateResultsViewed(user.id, user.couple.id);
  refresh();
  return { ok: true };
}
