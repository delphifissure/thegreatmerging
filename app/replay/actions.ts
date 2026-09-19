"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { callRole, configureLlm, MemoryMemo } from "@/lib/llm";
import { MoveCodeSchema, RehearsalTurnSchema } from "@/lib/llm/schemas";
import { buildVoiceInput, registersFor } from "@/lib/biographer/voice";
import { buildMoveCoderInput, buildRehearsalInput, cleanAccount, cleanSpeech, nextSpeaker, rehearsalReadiness, replayIsOver, REPLAY_LIMITS } from "@/lib/replay/inputs";
import { ENDINGS } from "@/lib/replay/moves";
import { SAFETY_TEXT_MESSAGES, screenText } from "@/lib/safety_text";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

/** Usage rows go to the database; outputs are never memoized there, because they echo what a person wrote. */
function configurePrivateLlm() {
  configureLlm({ recorder: new data.DbRecorder(), memo: new MemoryMemo() });
}

async function safetyStop(userId: string, ...texts: string[]): Promise<string | null> {
  for (const t of texts) {
    const hit = screenText(t);
    if (hit) {
      await data.recordVoiceSafetyEvent({ userId, kind: hit });
      return SAFETY_TEXT_MESSAGES[hit];
    }
  }
  return null;
}

const ProposeInput = z.object({
  label: z.string().trim().min(3).max(160),
  setting: z.string().trim().min(3).max(300),
  firstSpeaker: z.enum(["me", "partner"]),
  openingLine: z.string().trim().min(2).max(300),
});

/** Propose replaying one remembered argument. Everything in the frame is written for the partner to read. */
export async function proposeReplayAction(raw: z.infer<typeof ProposeInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = ProposeInput.safeParse(raw);
  if (!parsed.success) return fail("Say what it was about, where and when, and how it started.");
  const user = await requireAppUser();
  const partnerId = user.couple ? data.otherPartnerId(user.couple, user.id) : null;
  if (!user.couple || !partnerId) return fail("This needs both of you. Your partner has not joined yet.");
  const stop = await safetyStop(user.id, parsed.data.label, parsed.data.setting, parsed.data.openingLine);
  if (stop) return fail(stop);
  const replay = await data.proposeReplay({
    coupleId: user.couple.id,
    proposerId: user.id,
    partnerId,
    frame: { label: parsed.data.label, setting: parsed.data.setting, firstSpeaker: parsed.data.firstSpeaker === "me" ? "proposer" : "partner", openingLine: parsed.data.openingLine },
    maxTurns: REPLAY_LIMITS.maxTurns,
  });
  redirect(`/replay/${replay.id}`);
}

const RespondInput = z.object({ replayId: z.uuid(), accept: z.boolean() });

export async function respondAction(raw: z.infer<typeof RespondInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = RespondInput.safeParse(raw);
  if (!parsed.success) return fail("That replay could not be found.");
  const user = await requireAppUser();
  if (!(await data.respondToReplay({ ...parsed.data, userId: user.id }))) return fail("This invitation is not yours to answer, or it has been answered already.");
  refresh();
  return { ok: true };
}

const IdInput = z.object({ replayId: z.uuid() });

export async function withdrawAction(raw: z.infer<typeof IdInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = IdInput.safeParse(raw);
  if (!parsed.success) return fail("That replay could not be found.");
  const user = await requireAppUser();
  if (!(await data.withdrawReplay({ replayId: parsed.data.replayId, userId: user.id }))) return fail("That replay could not be withdrawn.");
  refresh();
  return { ok: true };
}

const AccountInput = z.object({
  replayId: z.uuid(),
  stateBefore: z.string().trim().min(3).max(600),
  myMoves: z.array(z.string()).min(1).max(14),
  theirMoves: z.array(z.string()).max(14),
  ending: z.enum(ENDINGS),
  notes: z.string().trim().max(1500).optional(),
});

/** One person's private memory of the argument. Only `stateBefore` ever reaches an avatar, and only their own. */
export async function saveAccountAction(raw: z.infer<typeof AccountInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = AccountInput.safeParse(raw);
  if (!parsed.success) return fail("Say what state you were in, tick at least one thing you did, and say how it ended.");
  const user = await requireAppUser();
  const replay = await data.getReplayFor(parsed.data.replayId, user.id);
  if (!replay || replay.status !== "accepted") return fail("This replay is not open for accounts.");
  const account = cleanAccount(parsed.data);
  if (!account) return fail("Say what state you were in, tick at least one thing you did, and say how it ended.");
  const stop = await safetyStop(user.id, account.stateBefore, account.notes);
  if (stop) return fail(stop);
  await data.saveAccount({ replayId: replay.id, userId: user.id, account });
  refresh();
  return { ok: true };
}

/** A deliberate, logged act: let my rehearsal avatar act on every line I have ratified, without ever saying them. */
export async function allowAllLinesAction(): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const user = await requireAppUser();
  const n = await data.allowAvatarUseOfAllLines(user.id);
  refresh();
  return { ok: true, message: n === 0 ? "Nothing to change." : `${n} ${n === 1 ? "line" : "lines"} can now shape what your rehearsal avatar does. It will never say them.` };
}

export type AdvanceResult = { ok: true; done: boolean; turns: number } | { ok: false; error: string };
const AdvanceInput = z.object({ replayId: z.uuid(), expected: z.number().int().min(0).max(40) });

/**
 * Take the replay one turn further. The browser calls this in a loop, so no request runs for a
 * minute, and either person can start or resume it. `expected` is how many turns the caller has
 * seen: if someone else got there first, nothing is generated.
 */
export async function advanceReplayAction(raw: z.infer<typeof AdvanceInput>): Promise<AdvanceResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.") as AdvanceResult;
  const parsed = AdvanceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That replay could not be found." };
  const user = await requireAppUser();
  const replay = await data.getReplayFor(parsed.data.replayId, user.id);
  if (!replay) return { ok: false, error: "This replay is not yours." };
  const seen = await data.listReplayTurns(replay.id, user.id);
  if (replay.status === "complete") return { ok: true, done: true, turns: seen.length };
  if (replay.status !== "accepted" && replay.status !== "running") return { ok: false, error: "This replay is not ready to run." };
  if (seen.length !== parsed.data.expected) return { ok: true, done: false, turns: seen.length };
  if ((await data.replayProgress(replay.id)).length < 2) return { ok: false, error: "Both of you need to write your account first." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The model is not configured." };

  const first = replay.frame.firstSpeaker === "proposer" ? replay.proposerId : replay.partnerId;
  const participants: [string, string] = [first, first === replay.proposerId ? replay.partnerId : replay.proposerId];
  configurePrivateLlm();
  const ctx = { coupleId: replay.coupleId };

  try {
    if (seen.length === 0) {
      // The opening line is the couple's own memory, not an avatar's. It is coded like any other turn.
      const opening = { speakerId: first, says: replay.frame.openingLine, does: null };
      const code = await callRole("move_coder", buildMoveCoderInput([opening], first), MoveCodeSchema, { ...ctx, userId: user.id, jobStep: "replay:code" });
      await data.appendReplayTurn({ replayId: replay.id, take: replay.take, seq: 1, speakerId: first, words: { says: opening.says, does: null }, move: code.move, secondaryMove: code.secondary, intent: null, impact: null, ends: false, remembered: true });
      await data.setReplayStatus(replay.id, "running");
      refresh();
      return { ok: true, done: false, turns: 1 };
    }

    const speakerId = nextSpeaker(seen, participants);
    const material = await data.replayRunnerMaterial({ replayId: replay.id, actorUserId: user.id, speakerId });
    if (!material) return { ok: false, error: "This replay is not yours." };
    if (!rehearsalReadiness(material.speaker.entries).ready) return { ok: false, error: `${speakerId === user.id ? "Your" : `${material.speaker.name}'s`} rehearsal avatar does not have enough lines it may use yet.` };

    const built = buildRehearsalInput({
      me: { id: speakerId, name: material.speaker.name },
      partnerName: material.partnerName,
      entries: material.speaker.entries,
      voice: buildVoiceInput({ ...material.speaker.voice, registers: registersFor("rehearsal") }),
      frame: replay.frame,
      stateBefore: material.speaker.stateBefore,
      coaching: material.speaker.coaching,
      turns: material.spoken,
      maxTurns: replay.maxTurns,
    });
    const out = await callRole("rehearsal", built.input, RehearsalTurnSchema, { ...ctx, userId: speakerId, jobStep: "replay:turn" });
    const turn = { speakerId, says: cleanSpeech(out.says), does: out.does?.trim() || null, ends: out.ends };
    const code = await callRole("move_coder", buildMoveCoderInput([...material.spoken, turn], first), MoveCodeSchema, { ...ctx, userId: speakerId, jobStep: "replay:code" });
    await data.appendReplayTurn({
      replayId: replay.id,
      take: replay.take,
      seq: material.spoken.length + 1,
      speakerId,
      words: { says: turn.says, does: turn.does },
      move: code.move,
      secondaryMove: code.secondary,
      intent: out.intent,
      impact: out.impact,
      ends: out.ends,
      drawsOn: out.draws_on.map(built.entryIdOf).filter((id): id is string => id !== null),
    });
    const done = replayIsOver([...material.spoken, turn], replay.maxTurns);
    if (done) await data.setReplayStatus(replay.id, "complete");
    refresh();
    return { ok: true, done, turns: material.spoken.length + 1 };
  } catch {
    return { ok: false, error: "That turn did not come through. Nothing is lost: try again and it carries on from here." };
  }
}

const VerdictInput = z.object({ replayId: z.uuid(), verdict: z.enum(["yes", "partly", "no"]) });

/** Did it have the shape of what happened? The one word of a verdict that the partner is told. */
export async function saveVerdictAction(raw: z.infer<typeof VerdictInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = VerdictInput.safeParse(raw);
  if (!parsed.success) return fail("That replay could not be found.");
  const user = await requireAppUser();
  const replay = await data.getReplayFor(parsed.data.replayId, user.id);
  if (!replay || replay.status !== "complete") return fail("There is nothing to give a verdict on yet.");
  await data.saveVerdict({ replayId: replay.id, userId: user.id, verdict: parsed.data.verdict });
  refresh();
  return { ok: true };
}

const OpenInput = z.object({ replayId: z.uuid(), open: z.boolean() });

/** "Watch it together": let my partner read what my avatar says. It takes both of us, and either of us can close it again. */
export async function setOpenAction(raw: z.infer<typeof OpenInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = OpenInput.safeParse(raw);
  if (!parsed.success) return fail("That replay could not be found.");
  const user = await requireAppUser();
  if (!(await data.setReplayOpen({ ...parsed.data, userId: user.id }))) return fail("That replay could not be changed.");
  refresh();
  return { ok: true };
}

const CoachInput = z.object({ replayId: z.uuid(), seq: z.number().int().min(2).max(40), note: z.string().trim().max(400) });

/** Coach your own avatar at one of its turns: what you would really have done there, in the first person. */
export async function saveCoachNoteAction(raw: z.infer<typeof CoachInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = CoachInput.safeParse(raw);
  if (!parsed.success) return fail("Keep the note under 400 characters.");
  const user = await requireAppUser();
  const replay = await data.getReplayFor(parsed.data.replayId, user.id);
  if (!replay) return fail("That replay could not be found.");
  const stop = await safetyStop(user.id, parsed.data.note);
  if (stop) return fail(stop);
  if (!(await data.saveCoachNote({ replayId: replay.id, userId: user.id, take: replay.take, seq: parsed.data.seq, note: parsed.data.note }))) return fail("You can only coach your own avatar, on the current take.");
  refresh();
  return { ok: true, message: parsed.data.note ? "Saved. Run it again from here and your avatar will act on it." : "Removed." };
}

const RetakeInput = z.object({ replayId: z.uuid(), fromSeq: z.number().int().min(2).max(40) });

/** Play it again from one of your own avatar's turns, with every coaching note so far. One replay is one draw, so this is also how to see another. */
export async function retakeAction(raw: z.infer<typeof RetakeInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = RetakeInput.safeParse(raw);
  if (!parsed.success) return fail("That turn could not be found.");
  const user = await requireAppUser();
  const take = await data.startRetake({ replayId: parsed.data.replayId, userId: user.id, fromSeq: parsed.data.fromSeq });
  if (!take) return fail("You can only run it again from one of your own avatar's turns.");
  redirect(`/replay/${parsed.data.replayId}`);
}

const TurnRatingInput = z.object({ replayId: z.uuid(), seq: z.number().int().min(1).max(40), rating: z.enum(["like_me", "not_like_me"]) });

/**
 * Turn by turn: did I do something like this? About the person's own avatar. While both have opened
 * their words, a person can also say whether their partner's avatar did what they remember their
 * partner doing. That is a flag for the partner to see, never a coaching of someone else's avatar.
 */
export async function rateReplayTurnAction(raw: z.infer<typeof TurnRatingInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = TurnRatingInput.safeParse(raw);
  if (!parsed.success) return fail("That turn could not be found.");
  const user = await requireAppUser();
  const replay = await data.getReplayFor(parsed.data.replayId, user.id);
  const own = replay ? await data.getOwnAccount(replay.id, user.id) : null;
  if (!replay || !own) return fail("That replay could not be found.");
  const turns = await data.listReplayTurns(replay.id, user.id);
  const turn = turns.find((t) => t.seq === parsed.data.seq && !t.remembered);
  if (!turn || (turn.speakerId !== user.id && !replay.open.both)) return fail("You can only rate what your own avatar did, unless you are watching it together.");
  await data.saveVerdict({ replayId: replay.id, userId: user.id, turnRatings: { ...own.turnRatings, [String(parsed.data.seq)]: parsed.data.rating } });
  refresh();
  return { ok: true };
}
