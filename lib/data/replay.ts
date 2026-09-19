/**
 * Replay of a remembered argument: the first place two people's avatars meet. What crosses between
 * the two people is decided here and nowhere else:
 *   - the frame, which the proposer writes for their partner to read;
 *   - the coded moves, the meant/landed numbers and each person's one-word verdict;
 *   - nothing else. A person's account, and what their avatar said, are returned to that person only.
 * Every read of one person's material on behalf of the other's click is written to the audit log.
 */
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decryptText, encryptText } from "@/lib/crypto";
import type { Account, Frame } from "@/lib/replay/inputs";
import type { Move } from "@/lib/replay/moves";
import { audit } from "./audit";
import { listCorrections, listOwnAnswers, listOwnEntries, listVoiceSamples, type DocumentEntry } from "./biographer";

export type ReplayStatus = "proposed" | "declined" | "accepted" | "running" | "complete" | "withdrawn";
export type ReplayVerdict = "yes" | "partly" | "no";
export type Replay = { id: string; coupleId: string; proposerId: string; partnerId: string; frame: Frame; status: ReplayStatus; maxTurns: number; created_at: Date };
export type ReplayTurnView = { seq: number; speakerId: string; move: Move; secondaryMove: Move | null; intent: number | null; impact: number | null; ends: boolean; remembered: boolean; words: { says: string | null; does: string | null } | null; drawsOn: string[] };

const ctx = (userId: string, field: "frame" | "account" | "words") => ({ user_id: userId, instrument_key: "replay", field });
const isParticipant = (r: { proposer_id: string; partner_id: string }, userId: string) => r.proposer_id === userId || r.partner_id === userId;

function toReplay(r: typeof schema.replays.$inferSelect): Replay {
  return { id: r.id, coupleId: r.couple_id, proposerId: r.proposer_id, partnerId: r.partner_id, frame: JSON.parse(decryptText(r.frame_enc, ctx(r.proposer_id, "frame"))) as Frame, status: r.status, maxTurns: r.max_turns, created_at: r.created_at };
}

// ---------------------------------------------------------------- proposing and consenting
export async function proposeReplay(input: { coupleId: string; proposerId: string; partnerId: string; frame: Frame; maxTurns?: number }): Promise<Replay> {
  const rows = await db()
    .insert(schema.replays)
    .values({ couple_id: input.coupleId, proposer_id: input.proposerId, partner_id: input.partnerId, frame_enc: encryptText(JSON.stringify(input.frame), ctx(input.proposerId, "frame")), max_turns: input.maxTurns ?? 12 })
    .returning();
  await audit({ actorUserId: input.proposerId, action: "consent.replay.propose", targetUserId: input.partnerId, targetTable: "replays", targetId: rows[0].id });
  return toReplay(rows[0]);
}

/** A replay, for one of its two participants. The frame was written to be read by the partner; the read is logged all the same. */
export async function getReplayFor(replayId: string, userId: string): Promise<Replay | null> {
  const rows = await db().select().from(schema.replays).where(eq(schema.replays.id, replayId)).limit(1);
  const r = rows[0];
  if (!r || !isParticipant(r, userId)) return null;
  if (r.proposer_id !== userId) await audit({ actorUserId: userId, action: "replay.frame.read", targetUserId: r.proposer_id, targetTable: "replays", targetId: r.id, consentState: { status: r.status } });
  return toReplay(r);
}

export async function listReplaysFor(userId: string): Promise<Replay[]> {
  const rows = await db()
    .select()
    .from(schema.replays)
    .where(or(eq(schema.replays.proposer_id, userId), eq(schema.replays.partner_id, userId)))
    .orderBy(desc(schema.replays.created_at));
  return rows.map(toReplay);
}

/** Only the invited partner can answer, and only once. Logged as a consent decision either way. */
export async function respondToReplay(input: { replayId: string; userId: string; accept: boolean }): Promise<boolean> {
  const rows = await db()
    .update(schema.replays)
    .set({ status: input.accept ? "accepted" : "declined", responded_at: new Date(), updated_at: new Date() })
    .where(and(eq(schema.replays.id, input.replayId), eq(schema.replays.partner_id, input.userId), eq(schema.replays.status, "proposed")))
    .returning();
  if (!rows[0]) return false;
  await audit({ actorUserId: input.userId, action: input.accept ? "consent.replay.accept" : "consent.replay.decline", targetUserId: rows[0].proposer_id, targetTable: "replays", targetId: rows[0].id });
  return true;
}

/**
 * Either person can withdraw at any point. The replay's turns go for good, both avatars' words
 * included, and the withdrawing person's account is blanked.
 */
export async function withdrawReplay(input: { replayId: string; userId: string }): Promise<boolean> {
  const rows = await db().select().from(schema.replays).where(eq(schema.replays.id, input.replayId)).limit(1);
  const r = rows[0];
  if (!r || !isParticipant(r, input.userId) || r.status === "withdrawn") return false;
  const turnIds = (await db().select({ id: schema.replay_turns.id }).from(schema.replay_turns).where(eq(schema.replay_turns.replay_id, r.id))).map((t) => t.id);
  if (turnIds.length) {
    await db().delete(schema.replay_turn_words).where(inArray(schema.replay_turn_words.turn_id, turnIds));
    await db().delete(schema.replay_turns).where(eq(schema.replay_turns.replay_id, r.id));
  }
  await db()
    .update(schema.replay_accounts)
    .set({ account_enc: encryptText("{}", ctx(input.userId, "account")), verdict: null, turn_ratings: {}, updated_at: new Date(), deleted_at: new Date() })
    .where(and(eq(schema.replay_accounts.replay_id, r.id), eq(schema.replay_accounts.user_id, input.userId)));
  await db().update(schema.replays).set({ status: "withdrawn", updated_at: new Date() }).where(eq(schema.replays.id, r.id));
  await audit({ actorUserId: input.userId, action: "consent.replay.withdraw", targetUserId: r.proposer_id === input.userId ? r.partner_id : r.proposer_id, targetTable: "replays", targetId: r.id });
  return true;
}

export async function setReplayStatus(replayId: string, status: "running" | "complete") {
  await db()
    .update(schema.replays)
    .set({ status, updated_at: new Date(), ...(status === "complete" ? { completed_at: new Date() } : {}) })
    .where(and(eq(schema.replays.id, replayId), inArray(schema.replays.status, ["accepted", "running"])));
}

// ---------------------------------------------------------------- private accounts and verdicts
export type OwnAccount = { account: Account; verdict: ReplayVerdict | null; turnRatings: Record<string, "like_me" | "not_like_me"> };

export async function saveAccount(input: { replayId: string; userId: string; account: Account }) {
  const enc = encryptText(JSON.stringify(input.account), ctx(input.userId, "account"));
  await db()
    .insert(schema.replay_accounts)
    .values({ replay_id: input.replayId, user_id: input.userId, account_enc: enc })
    .onConflictDoUpdate({ target: [schema.replay_accounts.replay_id, schema.replay_accounts.user_id], set: { account_enc: enc, updated_at: new Date(), deleted_at: null } });
}

export async function getOwnAccount(replayId: string, userId: string): Promise<OwnAccount | null> {
  const rows = await db()
    .select()
    .from(schema.replay_accounts)
    .where(and(eq(schema.replay_accounts.replay_id, replayId), eq(schema.replay_accounts.user_id, userId), sql`${schema.replay_accounts.deleted_at} is null`))
    .limit(1);
  if (!rows[0]) return null;
  return { account: JSON.parse(decryptText(rows[0].account_enc, ctx(userId, "account"))) as Account, verdict: rows[0].verdict, turnRatings: (rows[0].turn_ratings as OwnAccount["turnRatings"]) ?? {} };
}

/** Who has written their account, and each person's one-word verdict. Nothing else about an account ever leaves its owner. */
export async function replayProgress(replayId: string): Promise<Array<{ userId: string; verdict: ReplayVerdict | null }>> {
  const rows = await db()
    .select({ userId: schema.replay_accounts.user_id, verdict: schema.replay_accounts.verdict })
    .from(schema.replay_accounts)
    .where(and(eq(schema.replay_accounts.replay_id, replayId), sql`${schema.replay_accounts.deleted_at} is null`));
  return rows;
}

export async function saveVerdict(input: { replayId: string; userId: string; verdict?: ReplayVerdict; turnRatings?: Record<string, "like_me" | "not_like_me"> }) {
  await db()
    .update(schema.replay_accounts)
    .set({ ...(input.verdict ? { verdict: input.verdict } : {}), ...(input.turnRatings ? { turn_ratings: input.turnRatings } : {}), updated_at: new Date() })
    .where(and(eq(schema.replay_accounts.replay_id, input.replayId), eq(schema.replay_accounts.user_id, input.userId)));
}

// ---------------------------------------------------------------- turns
/**
 * The replay as one participant may see it: every turn's move and numbers, and words only for
 * their own avatar's turns and for the opening line, which came from the shared frame.
 */
export async function listReplayTurns(replayId: string, viewerId: string): Promise<ReplayTurnView[]> {
  const rows = await db()
    .select({ turn: schema.replay_turns, words: schema.replay_turn_words })
    .from(schema.replay_turns)
    .leftJoin(schema.replay_turn_words, eq(schema.replay_turn_words.turn_id, schema.replay_turns.id))
    .where(eq(schema.replay_turns.replay_id, replayId))
    .orderBy(asc(schema.replay_turns.seq));
  return rows.map(({ turn, words }) => {
    const mine = turn.speaker_id === viewerId || turn.remembered;
    return {
      seq: turn.seq,
      speakerId: turn.speaker_id,
      move: turn.move as Move,
      secondaryMove: (turn.secondary_move as Move | null) ?? null,
      intent: turn.intent,
      impact: turn.impact,
      ends: turn.ends,
      remembered: turn.remembered,
      words: mine && words ? (JSON.parse(decryptText(words.words_enc, ctx(words.user_id, "words"))) as { says: string | null; does: string | null }) : null,
      drawsOn: mine && words && turn.speaker_id === viewerId ? ((words.draws_on as string[]) ?? []) : [],
    };
  });
}

/**
 * Everything the runner needs to take one more turn: both avatars' words so far, and for the avatar
 * about to speak, its person's usable lines, how they write, and the state they were in. Started by
 * one participant's click and reading the other's material, so it is logged against them.
 */
export async function replayRunnerMaterial(input: { replayId: string; actorUserId: string; speakerId: string }) {
  const rows = await db().select().from(schema.replays).where(eq(schema.replays.id, input.replayId)).limit(1);
  const r = rows[0];
  if (!r || !isParticipant(r, input.actorUserId) || !isParticipant(r, input.speakerId)) return null;
  const other = r.proposer_id === input.actorUserId ? r.partner_id : r.proposer_id;
  await audit({ actorUserId: input.actorUserId, actorKind: "system", action: "replay.turn.build", targetUserId: other, targetTable: "replays", targetId: r.id, consentState: { status: r.status } });

  const turns = await db()
    .select({ turn: schema.replay_turns, words: schema.replay_turn_words })
    .from(schema.replay_turns)
    .innerJoin(schema.replay_turn_words, eq(schema.replay_turn_words.turn_id, schema.replay_turns.id))
    .where(eq(schema.replay_turns.replay_id, r.id))
    .orderBy(asc(schema.replay_turns.seq));
  const spoken = turns.map(({ turn, words }) => ({ seq: turn.seq, speakerId: turn.speaker_id, ends: turn.ends, ...(JSON.parse(decryptText(words.words_enc, ctx(words.user_id, "words"))) as { says: string | null; does: string | null }) }));

  const [entries, answers, pasted, corrections, account, users] = await Promise.all([
    listOwnEntries(input.speakerId, { status: "ratified" }),
    listOwnAnswers(input.speakerId),
    listVoiceSamples(input.speakerId),
    listCorrections(input.speakerId),
    getOwnAccount(r.id, input.speakerId),
    db().select({ id: schema.users.id, name: schema.users.display_name }).from(schema.users).where(inArray(schema.users.id, [r.proposer_id, r.partner_id])),
  ]);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "your partner";
  return {
    replay: toReplay(r),
    spoken,
    // Private lines never leave this module for a replay. The input builder filters again.
    speaker: { id: input.speakerId, name: nameOf(input.speakerId), entries: (entries as DocumentEntry[]).filter((e) => e.tier !== "private"), stateBefore: account?.account.stateBefore ?? "", voice: { samples: [...answers.map((text) => ({ register: "considered" as const, text })), ...pasted.map((s) => ({ register: s.register, text: s.text }))], corrections } },
    partnerName: nameOf(r.proposer_id === input.speakerId ? r.partner_id : r.proposer_id),
  };
}

/**
 * Whether each avatar has enough lines it may use. Counts only: nothing about what the lines say.
 * Reads the other person's line counts on this person's behalf, so it is logged.
 */
export async function replayReadiness(input: { replayId: string; actorUserId: string }): Promise<Array<{ userId: string; usable: number; constitution: number; ratified: number }> | null> {
  const rows = await db().select().from(schema.replays).where(eq(schema.replays.id, input.replayId)).limit(1);
  const r = rows[0];
  if (!r || !isParticipant(r, input.actorUserId)) return null;
  const other = r.proposer_id === input.actorUserId ? r.partner_id : r.proposer_id;
  await audit({ actorUserId: input.actorUserId, action: "replay.readiness.read", targetUserId: other, targetTable: "document_entries", targetId: r.id, consentState: { status: r.status } });
  const out = [];
  for (const userId of [r.proposer_id, r.partner_id]) {
    const entries = await listOwnEntries(userId, { status: "ratified" });
    const usable = entries.filter((e) => e.tier !== "private");
    out.push({ userId, usable: usable.length, constitution: usable.filter((e) => e.document === "constitution").length, ratified: entries.length });
  }
  return out;
}

/** Add a turn at an exact position. Two browsers may ask for the same turn at once; the second is dropped. */
export async function appendReplayTurn(input: { replayId: string; seq: number; speakerId: string; words: { says: string | null; does: string | null }; move: Move; secondaryMove: Move | null; intent: number | null; impact: number | null; ends: boolean; remembered?: boolean; drawsOn?: string[] }): Promise<boolean> {
  const rows = await db()
    .insert(schema.replay_turns)
    .values({ replay_id: input.replayId, seq: input.seq, speaker_id: input.speakerId, move: input.move, secondary_move: input.secondaryMove, intent: input.intent, impact: input.impact, ends: input.ends, remembered: input.remembered ?? false })
    .onConflictDoNothing()
    .returning();
  if (!rows[0]) return false;
  await db().insert(schema.replay_turn_words).values({ turn_id: rows[0].id, user_id: input.speakerId, words_enc: encryptText(JSON.stringify(input.words), ctx(input.speakerId, "words")), draws_on: input.drawsOn ?? [] });
  return true;
}

/** How many of a person's lines their rehearsal avatar may use, and a way to allow all of them at once. Logged, because it widens what reaches another person's avatar. */
export async function allowAvatarUseOfAllLines(userId: string): Promise<number> {
  const rows = await db()
    .update(schema.document_entries)
    .set({ tier: "avatar_only", updated_at: new Date() })
    .where(and(eq(schema.document_entries.user_id, userId), eq(schema.document_entries.status, "ratified"), eq(schema.document_entries.tier, "private"), sql`${schema.document_entries.deleted_at} is null`))
    .returning({ id: schema.document_entries.id });
  await audit({ actorUserId: userId, action: "consent.tier.allow_avatar_all", targetUserId: userId, targetTable: "document_entries", metadata: { lines: rows.length } });
  return rows.length;
}

export async function setEntryTier(input: { entryId: string; userId: string; tier: "private" | "avatar_only" | "shareable" }) {
  await db()
    .update(schema.document_entries)
    .set({ tier: input.tier, updated_at: new Date() })
    .where(and(eq(schema.document_entries.id, input.entryId), eq(schema.document_entries.user_id, input.userId)));
  await audit({ actorUserId: input.userId, action: `consent.tier.${input.tier}`, targetUserId: input.userId, targetTable: "document_entries", targetId: input.entryId });
}
