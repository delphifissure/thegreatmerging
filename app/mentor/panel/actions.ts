"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { callRole, configureLlm, MemoryMemo } from "@/lib/llm";
import { VersionReplySchema } from "@/lib/llm/schemas";
import { mentorReadiness } from "@/lib/biographer/inputs";
import { buildPanelReaderInput, buildVersionInput, panelReadingSchemaFor, panelVersionsFor, RATINGS_BEFORE_READING, VERSION_FALLBACK, versionByKey } from "@/lib/biographer/versions";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

/** Usage rows go to the database; outputs are never memoized there, because they echo what a person wrote. */
function configurePrivateLlm() {
  configureLlm({ recorder: new data.DbRecorder(), memo: new MemoryMemo() });
}

const AskInput = z.object({ text: z.string().trim().min(1).max(4000) });

/** Put one situation to every version that can be built from the person's ratified lines, at once. */
export async function askPanel(raw: z.infer<typeof AskInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = AskInput.safeParse(raw);
  if (!parsed.success) return fail("Describe the situation first, then ask.");
  const user = await requireAppUser();
  const entries = await data.listOwnEntries(user.id, { status: "ratified" });
  if (!mentorReadiness(entries).ready) return fail("There are not enough ratified lines yet to build this.");

  const thread = await data.createThread({ userId: user.id, kind: "panel", focus: null });
  await data.appendTurn({ threadId: thread.id, userId: user.id, role: "person", text: parsed.data.text });

  const safety = screenText(parsed.data.text);
  if (safety) {
    await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text: SAFETY_TEXT_MESSAGES[safety], meta: { kind: "safety", safety } });
    await data.recordTextSafetyEvent({ userId: user.id, threadId: thread.id, kind: safety });
    redirect(`/mentor/panel/${thread.id}`);
  }
  if (!process.env.ANTHROPIC_API_KEY) return fail("Your situation is saved, but the model is not configured.");

  configurePrivateLlm();
  const versions = panelVersionsFor(entries);
  const ctx = { coupleId: user.couple?.id ?? null, userId: user.id };
  const replies = await Promise.allSettled(
    versions.map((version, i) => {
      const built = buildVersionInput({ personName: user.displayName, entries, situation: parsed.data.text, version, replicate: i + 1 });
      return callRole("version", built.input, VersionReplySchema, { ...ctx, jobStep: `panel:${version.key}` }).then((out) => ({ out, entryIdOf: built.entryIdOf }));
    }),
  );
  // Stored in display order, one after another: a turn's position comes from the turns before it.
  for (const [i, version] of versions.entries()) {
    const r = replies[i];
    if (r.status === "fulfilled") {
      const { out, entryIdOf } = r.value;
      await data.appendTurn({
        threadId: thread.id,
        userId: user.id,
        role: "avatar",
        text: out.reply.trim(),
        note: out.unsure ? (out.question_for_biographer ?? null) : null,
        // The opening line and the change quote the person's own lines, so they are stored encrypted.
        extras: { options: [], threads: [], opening_line: out.opening_line?.trim() || null, change: version.changeText },
        meta: { version: version.key, draws_on: out.draws_on.map(entryIdOf).filter((id): id is string => id !== null), unsure: out.unsure },
      });
    } else {
      await data.appendTurn({ threadId: thread.id, userId: user.id, role: "avatar", text: VERSION_FALLBACK, extras: { options: [], threads: [], change: version.changeText }, meta: { version: version.key, draws_on: [], unsure: false, fallback: true } });
    }
  }
  redirect(`/mentor/panel/${thread.id}`);
}

const RateInput = z.object({ turnId: z.uuid(), rating: z.enum(["like_me", "bad_day", "not_like_me"]) });

/** The person's verdict on one version: me, me on a bad day, or not me. */
export async function rateVersion(raw: z.infer<typeof RateInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = RateInput.safeParse(raw);
  if (!parsed.success) return fail("That version could not be found.");
  const user = await requireAppUser();
  await data.rateTurn({ ...parsed.data, userId: user.id });
  refresh();
  return { ok: true };
}

const ReadInput = z.object({ threadId: z.uuid() });

/** Read across the versions once the person has said which of them they recognize. Their verdicts go in with the answers. */
export async function readPanel(raw: z.infer<typeof ReadInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = ReadInput.safeParse(raw);
  if (!parsed.success) return fail("That panel could not be found.");
  const user = await requireAppUser();
  const thread = await data.getOwnThread(parsed.data.threadId, user.id);
  if (!thread || thread.kind !== "panel") return fail("This panel is not yours.");
  const turns = await data.listTurns(thread.id, user.id);
  const situation = turns.find((t) => t.role === "person")?.text;
  const answered = turns.filter((t) => t.role === "avatar" && t.meta.fallback !== true && versionByKey(t.meta.version));
  if (!situation || answered.length < 2) return fail("There is nothing to read across yet.");
  if (answered.filter((t) => t.rating).length < RATINGS_BEFORE_READING) return fail(`Say which of these you recognize first: at least ${RATINGS_BEFORE_READING}.`);
  if (!process.env.ANTHROPIC_API_KEY) return fail("The model is not configured.");

  const input = buildPanelReaderInput({ personName: user.displayName, situation, turns });
  try {
    configurePrivateLlm();
    const out = await callRole("panel_reader", input, panelReadingSchemaFor(input.versions.map((v) => v.key)), { coupleId: user.couple?.id ?? null, userId: user.id, jobStep: "panel:reading" });
    await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text: out.question.trim(), extras: { options: [], threads: [], reading: { same: out.same, differs: out.differs } }, meta: { kind: "panel_reading" } });
  } catch {
    return fail("The reading did not come through. Try again in a moment.");
  }
  refresh();
  return { ok: true };
}
