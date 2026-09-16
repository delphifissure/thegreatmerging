"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "@/lib/data";
import { inngest } from "@/inngest/client";
import { loadColorModule } from "@/lib/color/config";
import { currentItem, MachineError, reduce, type Effect, type MachineState } from "@/lib/color/machine";
import { callRole, configureLlm } from "@/lib/llm";
import { ConcretenessOutputSchema } from "@/lib/llm/schemas";
import { DomainSchema } from "@/instruments/schema";
import { requirePartner } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";
import { flaggedDomainsFor } from "@/app/color/_lib/context";

const Base = { sessionId: z.uuid(), questionId: z.string().min(1).max(200) };
const TurnInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), ...Base, text: z.string().trim().min(1).max(8000), shareable: z.boolean() }),
  z.object({ type: z.literal("skip"), ...Base }),
  z.object({ type: z.literal("tag"), ...Base, tag: z.enum(["requirement", "preference"]), comment: z.string().trim().min(1).max(4000), shareable: z.boolean() }),
]);
export type TurnInput = z.infer<typeof TurnInput>;

export async function submitTurn(raw: TurnInput): Promise<ActionResult> {
  const parsed = TurnInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.data === undefined && raw?.type === "tag" ? "A tag needs a choice and a comment." : "That could not be saved. Check the form and try again.");
  const input = parsed.data;
  const user = await requirePartner();
  const session = await data.getColorSession(input.sessionId);
  if (!session || session.user_id !== user.id || session.couple_id !== user.couple.id) return fail("This session is not yours.");
  const domain = DomainSchema.parse(session.domain);
  const config = loadColorModule(domain);
  let state = session.state as MachineState;
  const item = currentItem(state);
  if (!item || item.id !== input.questionId) {
    refresh();
    return fail("That question has already been answered. The screen has been refreshed.");
  }

  const at = new Date().toISOString();
  let effects: Effect[] = [];
  try {
    const r =
      input.type === "answer"
        ? reduce(state, { type: "answer", text: input.text, at }, config)
        : input.type === "skip"
          ? reduce(state, { type: "skip", at }, config)
          : reduce(state, { type: "tag", tag: input.tag, comment: input.comment, at }, config);
    state = r.state;
    effects = r.effects;
  } catch (err) {
    return fail(err instanceof MachineError ? err.message : "That could not be saved.");
  }

  const step = item.kind === "probe" ? "probe" : item.step === "consistency" ? "probe" : item.step;
  const answerText = input.type === "answer" ? input.text : input.type === "tag" ? input.comment : null;
  await data.writeColorAnswer({
    sessionId: session.id,
    userId: user.id,
    coupleId: user.couple.id,
    step,
    questionId: item.id,
    questionText: item.text,
    itemRef: item.item_ref ?? (item.kind === "tag" ? item.id : null),
    answerText,
    skipped: input.type === "skip",
    shareableVerbatim: input.type === "skip" ? false : input.shareable,
  });
  if (input.type === "tag") {
    await data.writeTag({ userId: user.id, coupleId: user.couple.id, domain, itemRef: item.id, tag: input.tag, comment: input.comment });
  }

  const questionContent = item.kind === "tag" && item.topics?.length ? `${item.text} (${item.topics.join("; ")})` : item.reason_text ? `${item.text} Reason: ${item.reason_text}` : item.text;
  const userContent = input.type === "skip" ? "Skipped" : input.type === "tag" ? `${input.tag === "requirement" ? "Requirement" : "Preference"}: ${input.comment}` : input.text;
  const transcript: data.TranscriptTurn[] = [
    { role: "system", content: questionContent, step: item.step, question_id: item.id, at },
    { role: "user", content: userContent, step: item.step, question_id: item.id, at },
  ];

  let sendProbe = false;
  for (const e of effects) {
    if (e.type === "run_prober") sendProbe = true;
    if (e.type !== "run_concreteness") continue;
    let concrete = true;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        configureLlm({ recorder: new data.DbRecorder(), memo: new data.DbMemo() });
        const out = await callRole("concreteness", { question_text: e.question_text, answer_text: e.answer_text }, ConcretenessOutputSchema, { coupleId: user.couple.id, userId: user.id, jobStep: "color:concreteness" });
        concrete = out.concrete;
      } catch {
        concrete = true;
      }
    }
    const r2 = reduce(state, { type: "concreteness_result", question_id: e.question_id, concrete }, config);
    state = r2.state;
    if (r2.effects.some((x) => x.type === "run_prober")) sendProbe = true;
    if (!concrete) transcript.push({ role: "system", content: config.common.transitions.ack, step: item.step, question_id: item.id, at });
  }

  await data.saveColorSession({ sessionId: session.id, state, appendTranscript: transcript });

  if (sendProbe) {
    try {
      await inngest.send({ name: "color/probe.requested", data: { sessionId: session.id, userId: user.id, coupleId: user.couple.id, domain } });
    } catch {
      // The domain screen offers a retry while the machine waits in `consistency`.
    }
  }

  if (state.state === "complete") await maybeSignalColorComplete(user.id, user.couple.id);
  refresh();
  return { ok: true };
}

async function maybeSignalColorComplete(userId: string, coupleId: string): Promise<void> {
  const flagged = (await flaggedDomainsFor(userId, coupleId)).map((d) => d.domain);
  const status = await data.coupleColorStatus(coupleId, flagged);
  if (!status.both_complete) return;
  if ((await data.getBriefs(coupleId)).length > 0) return;
  try {
    await inngest.send({ name: "couple/color.completed", data: { coupleId } });
  } catch {
    // The brief page shows the waiting state; the couple can retry from there.
  }
}

/** Re-sends the prober event for a session stuck waiting in `consistency`. Idempotent job. */
export async function requestProbes(input: { sessionId: string }): Promise<ActionResult> {
  const parsed = z.object({ sessionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("Unknown session.");
  const user = await requirePartner();
  const session = await data.getColorSession(parsed.data.sessionId);
  if (!session || session.user_id !== user.id) return fail("This session is not yours.");
  const state = session.state as MachineState;
  if (state.probes_loaded || state.state !== "consistency") return fail("Follow-ups are not pending for this domain.");
  try {
    await inngest.send({ name: "color/probe.requested", data: { sessionId: session.id, userId: user.id, coupleId: user.couple.id, domain: session.domain } });
  } catch {
    return fail("Could not request follow-ups. Try again in a minute.");
  }
  refresh();
  return { ok: true, message: "Requested. Check again in a moment." };
}

/** Retry path for the brief job when both partners are complete and no brief exists. */
export async function requestBrief(): Promise<ActionResult> {
  const user = await requirePartner();
  await maybeSignalColorComplete(user.id, user.couple.id);
  refresh();
  return { ok: true, message: "Requested." };
}
