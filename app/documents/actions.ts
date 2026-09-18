"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { sectionBelongsTo } from "@/lib/llm/schemas";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

const Mark = z.enum(["settled", "open"]);
const Tier = z.enum(["private", "avatar_only", "shareable"]);

const RatifyInput = z.object({ entryId: z.uuid(), text: z.string().trim().min(1).max(600).optional(), mark: Mark.optional(), tier: Tier.optional() });

/** The signature: nothing is part of a document until its owner ratifies it, with or without an edit. */
export async function ratify(raw: z.infer<typeof RatifyInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = RatifyInput.safeParse(raw);
  if (!parsed.success) return fail("A line needs some text, up to 600 characters.");
  const user = await requireAppUser();
  await data.ratifyEntry({ ...parsed.data, userId: user.id });
  refresh();
  return { ok: true };
}

const IdInput = z.object({ entryId: z.uuid() });

export async function reject(raw: z.infer<typeof IdInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = IdInput.safeParse(raw);
  if (!parsed.success) return fail("That line could not be found.");
  const user = await requireAppUser();
  await data.rejectEntry({ entryId: parsed.data.entryId, userId: user.id });
  refresh();
  return { ok: true };
}

export async function remove(raw: z.infer<typeof IdInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = IdInput.safeParse(raw);
  if (!parsed.success) return fail("That line could not be found.");
  const user = await requireAppUser();
  await data.removeEntry({ entryId: parsed.data.entryId, userId: user.id });
  refresh();
  return { ok: true };
}

const OwnInput = z.object({ document: z.enum(["history", "constitution"]), section: z.string().min(1).max(40), text: z.string().trim().min(1).max(600), mark: Mark });

export async function addOwn(raw: z.infer<typeof OwnInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = OwnInput.safeParse(raw);
  if (!parsed.success || !sectionBelongsTo(parsed.data.document, parsed.data.section)) return fail("Pick a section and write a line, up to 600 characters.");
  const user = await requireAppUser();
  await data.addOwnEntry({ userId: user.id, ...parsed.data });
  refresh();
  return { ok: true };
}
