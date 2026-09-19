/**
 * Replay of a remembered argument against a real Postgres: the first feature where two people's
 * material meets. These tests are about what does NOT cross: accounts, an avatar's words, private
 * lines. Run with the other integration tests. Skipped without RUN_DB_TESTS=1.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyBase64 } from "@/lib/crypto";
import { connect, DB_TESTS_ENABLED, deleteFixture, prepareDatabase, runAs, SKIP_MESSAGE, type Sql } from "./helpers/db";

process.env.FIELD_ENCRYPTION_KEY ||= generateKeyBase64();

import { getSql } from "@/db/client";
import {
  addOwnEntry,
  allowAvatarUseOfAllLines,
  appendReplayTurn,
  getOwnAccount,
  getReplayFor,
  listOwnEntries,
  listReplaysFor,
  listReplayTurns,
  proposeReplay,
  replayProgress,
  replayReadiness,
  replayRunnerMaterial,
  respondToReplay,
  saveAccount,
  saveVerdict,
  setEntryTier,
  setReplayStatus,
  withdrawReplay,
} from "@/lib/data";

const suite = DB_TESTS_ENABLED ? describe : describe.skip;
const frame = { label: "The card statement in March", setting: "A weeknight, in the kitchen", firstSpeaker: "partner" as const, openingLine: "Can we go through the statement tonight?" };
const account = (state: string) => ({ stateBefore: state, myMoves: ["explains" as const], theirMoves: ["asks" as const], ending: "one_left" as const, notes: "" });

suite(`replay data ${DB_TESTS_ENABLED ? "" : SKIP_MESSAGE}`, () => {
  let sql: Sql;
  const [A, B, C] = [randomUUID(), randomUUID(), randomUUID()];
  let coupleId = "";
  const auditCount = async (action: string, target: string) => (await sql<Array<{ n: number }>>`select count(*)::int as n from audit_log where action = ${action} and target_user_id = ${target}`)[0].n;

  beforeAll(async () => {
    sql = connect();
    await prepareDatabase(sql);
    await sql`insert into users (id, auth_provider_id, display_name) values (${A}, ${A}, 'Ben'), (${B}, ${B}, 'Ana'), (${C}, ${C}, 'Someone else')`;
    const [couple] = await sql<Array<{ id: string }>>`insert into couples (partner_a_id, partner_b_id, status) values (${A}, ${B}, 'active') returning id`;
    coupleId = couple.id;
  });

  afterAll(async () => {
    await sql`delete from audit_log where actor_user_id in ${sql([A, B, C])}`;
    await deleteFixture(sql, [A, B, C], [coupleId]);
    await sql.end();
    await getSql().end();
  });

  it("a proposal is encrypted, visible to its two participants and nobody else, and only the invited partner can answer it, once", async () => {
    const replay = await proposeReplay({ coupleId, proposerId: A, partnerId: B, frame });
    expect(replay.status).toBe("proposed");
    const [raw] = await sql<Array<{ frame_enc: Buffer }>>`select frame_enc from replays where id = ${replay.id}`;
    expect(raw.frame_enc.toString("utf8")).not.toContain("statement");

    expect((await getReplayFor(replay.id, B))?.frame).toEqual(frame);
    expect(await getReplayFor(replay.id, C)).toBeNull();
    expect(await listReplaysFor(C)).toEqual([]);
    // The frame was written for the partner to read; the read is logged all the same.
    expect(await auditCount("replay.frame.read", A)).toBe(1);
    expect(await auditCount("consent.replay.propose", B)).toBe(1);

    expect(await respondToReplay({ replayId: replay.id, userId: A, accept: true })).toBe(false);
    expect(await respondToReplay({ replayId: replay.id, userId: C, accept: true })).toBe(false);
    expect(await respondToReplay({ replayId: replay.id, userId: B, accept: true })).toBe(true);
    expect(await respondToReplay({ replayId: replay.id, userId: B, accept: false })).toBe(false);
    expect((await getReplayFor(replay.id, A))?.status).toBe("accepted");
    expect(await auditCount("consent.replay.accept", A)).toBe(1);
  });

  it("an account never leaves its owner; the other person learns only that it exists, and later one word", async () => {
    const replay = (await listReplaysFor(A))[0];
    await saveAccount({ replayId: replay.id, userId: A, account: account("Home late, dreading it.") });
    await saveAccount({ replayId: replay.id, userId: B, account: account("Calm on the surface.") });
    await saveAccount({ replayId: replay.id, userId: A, account: account("Home late, hadn't eaten, dreading it.") });

    expect((await getOwnAccount(replay.id, A))?.account.stateBefore).toBe("Home late, hadn't eaten, dreading it.");
    expect(await getOwnAccount(replay.id, C)).toBeNull();
    const [raw] = await sql<Array<{ account_enc: Buffer }>>`select account_enc from replay_accounts where replay_id = ${replay.id} and user_id = ${A}`;
    expect(raw.account_enc.toString("utf8")).not.toContain("dreading");

    const progress = await replayProgress(replay.id);
    expect(progress.map((p) => p.userId).sort()).toEqual([A, B].sort());
    expect(Object.keys(progress[0]).sort()).toEqual(["userId", "verdict"]);
  });

  it("each person reads their own avatar's words and only the coded move of the other's; the agreed opening line is for both", async () => {
    const replay = (await listReplaysFor(A))[0];
    expect(await appendReplayTurn({ replayId: replay.id, seq: 1, speakerId: B, words: { says: frame.openingLine, does: null }, move: "asks", secondaryMove: null, intent: null, impact: null, ends: false, remembered: true })).toBe(true);
    expect(await appendReplayTurn({ replayId: replay.id, seq: 2, speakerId: A, words: { says: "It's the bike parts. I was going to tell you.", does: null }, move: "defends", secondaryMove: "explains", intent: -1, impact: -1, ends: false, drawsOn: ["line-1"] })).toBe(true);
    expect(await appendReplayTurn({ replayId: replay.id, seq: 3, speakerId: B, words: { says: "You weren't, though. It's been weeks.", does: null }, move: "criticizes", secondaryMove: null, intent: -1, impact: -2, ends: false })).toBe(true);
    // Two browsers asking for the same turn: the second is dropped, not appended after it.
    expect(await appendReplayTurn({ replayId: replay.id, seq: 3, speakerId: B, words: { says: "A duplicate.", does: null }, move: "other", secondaryMove: null, intent: 0, impact: 0, ends: false })).toBe(false);

    const asBen = await listReplayTurns(replay.id, A);
    expect(asBen.map((t) => t.move)).toEqual(["asks", "defends", "criticizes"]);
    expect(asBen[0].words?.says).toBe(frame.openingLine);
    expect(asBen[1]).toMatchObject({ words: { says: "It's the bike parts. I was going to tell you.", does: null }, drawsOn: ["line-1"], secondaryMove: "explains" });
    expect(asBen[2]).toMatchObject({ words: null, drawsOn: [], impact: -2, intent: -1 });

    const asAna = await listReplayTurns(replay.id, B);
    expect(asAna[1]).toMatchObject({ words: null, drawsOn: [], move: "defends" });
    expect(asAna[2].words?.says).toBe("You weren't, though. It's been weeks.");
    expect(JSON.stringify(asAna)).not.toContain("bike parts");
    expect(JSON.stringify(asBen)).not.toContain("been weeks");

    const [raw] = await sql<Array<{ words_enc: Buffer }>>`select w.words_enc from replay_turn_words w join replay_turns t on t.id = w.turn_id where t.replay_id = ${replay.id} and t.seq = 2`;
    expect(raw.words_enc.toString("utf8")).not.toContain("bike");
  });

  it("the runner is handed only the speaker's usable lines and state, never a private line or anyone's memory of what they did, and the read is logged", async () => {
    const replay = (await listReplaysFor(A))[0];
    const secret = await addOwnEntry({ userId: B, document: "constitution", section: "fears", text: "That silence means he's already decided to leave.", mark: "open" });
    const usable = await addOwnEntry({ userId: B, document: "constitution", section: "conflict", text: "I raise things the moment I notice them.", mark: "open" });
    await setEntryTier({ entryId: usable.id, userId: B, tier: "avatar_only" });
    await setEntryTier({ entryId: usable.id, userId: A, tier: "shareable" });
    expect((await listOwnEntries(B)).find((e) => e.id === usable.id)?.tier).toBe("avatar_only");
    expect((await listOwnEntries(B)).find((e) => e.id === secret.id)?.tier).toBe("private");

    const before = await auditCount("replay.turn.build", B);
    const material = await replayRunnerMaterial({ replayId: replay.id, actorUserId: A, speakerId: B });
    expect(await auditCount("replay.turn.build", B)).toBe(before + 1);
    expect(material?.speaker).toMatchObject({ id: B, name: "Ana", stateBefore: "Calm on the surface." });
    expect(material?.partnerName).toBe("Ben");
    expect(material?.spoken.map((t) => t.says)).toHaveLength(3);
    // A private line is not handed over at all, and neither is anyone's memory of what they did.
    expect(material?.speaker.entries.map((e) => e.id)).toEqual([usable.id]);
    expect(JSON.stringify(material)).not.toMatch(/already decided to leave|myMoves|theirMoves|one_left/);
    expect(await replayRunnerMaterial({ replayId: replay.id, actorUserId: C, speakerId: B })).toBeNull();
    expect(await replayRunnerMaterial({ replayId: replay.id, actorUserId: A, speakerId: C })).toBeNull();

    const readiness = await replayReadiness({ replayId: replay.id, actorUserId: A });
    expect(readiness?.find((r) => r.userId === B)).toEqual({ userId: B, usable: 1, constitution: 1, ratified: 2 });
    expect(await replayReadiness({ replayId: replay.id, actorUserId: C })).toBeNull();

    expect(await allowAvatarUseOfAllLines(B)).toBe(1);
    expect((await listOwnEntries(B)).every((e) => e.tier !== "private")).toBe(true);
    expect(await auditCount("consent.tier.allow_avatar_all", B)).toBe(1);
  });

  it("a verdict is one word to the partner, and turn ratings stay with their owner", async () => {
    const replay = (await listReplaysFor(A))[0];
    await setReplayStatus(replay.id, "running");
    await setReplayStatus(replay.id, "complete");
    expect((await getReplayFor(replay.id, A))?.status).toBe("complete");
    await saveVerdict({ replayId: replay.id, userId: A, verdict: "partly", turnRatings: { "2": "not_like_me" } });
    expect(await getOwnAccount(replay.id, A)).toMatchObject({ verdict: "partly", turnRatings: { "2": "not_like_me" } });
    expect((await replayProgress(replay.id)).find((p) => p.userId === A)).toEqual({ userId: A, verdict: "partly" });
  });

  it("row-level security: a stranger sees nothing, and a participant cannot read the other's words or account", async () => {
    const counts = (tx: Parameters<Parameters<typeof runAs>[2]>[0]) =>
      Promise.all([tx`select count(*)::int as n from replays`, tx`select count(*)::int as n from replay_turns`, tx`select count(*)::int as n from replay_turn_words`, tx`select count(*)::int as n from replay_accounts`]).then((r) => r.map((x) => x[0].n));
    expect(await runAs(sql, A, counts)).toEqual([1, 3, 1, 1]);
    expect(await runAs(sql, B, counts)).toEqual([1, 3, 2, 1]);
    expect(await runAs(sql, C, counts)).toEqual([0, 0, 0, 0]);
    expect(await runAs(sql, null, counts)).toEqual([0, 0, 0, 0]);
    // Nobody can write an avatar's words or a move from a browser session: those come from the runner.
    const [turn] = await sql<Array<{ id: string }>>`select id from replay_turns order by seq limit 1`;
    await expect(runAs(sql, A, (tx) => tx`insert into replay_turn_words (turn_id, user_id, words_enc) values (${turn.id}, ${A}, ${Buffer.from([1])})`)).rejects.toThrow();
    await expect(runAs(sql, A, (tx) => tx`insert into replays (couple_id, proposer_id, partner_id, frame_enc) values (${coupleId}, ${B}, ${A}, ${Buffer.from([1])})`)).rejects.toThrow();
  });

  it("either person can withdraw: the turns and both avatars' words are deleted, and their account is blanked", async () => {
    const replay = (await listReplaysFor(A))[0];
    expect(await withdrawReplay({ replayId: replay.id, userId: C })).toBe(false);
    expect(await withdrawReplay({ replayId: replay.id, userId: B })).toBe(true);
    expect((await getReplayFor(replay.id, A))?.status).toBe("withdrawn");
    expect(await listReplayTurns(replay.id, A)).toEqual([]);
    const [left] = await sql<Array<{ n: number }>>`select count(*)::int as n from replay_turn_words where user_id in ${sql([A, B])}`;
    expect(left.n).toBe(0);
    expect(await getOwnAccount(replay.id, B)).toBeNull();
    expect(await getOwnAccount(replay.id, A)).not.toBeNull();
    expect(await withdrawReplay({ replayId: replay.id, userId: A })).toBe(false);
    expect(await auditCount("consent.replay.withdraw", A)).toBe(1);
  });
});
