/**
 * Intervention prototype against a real Postgres: conversations and document lines are encrypted
 * at rest, belong to one person, and are invisible to the partner under row-level security.
 *
 * Run with the other integration tests (see rls.test.ts for how). Skipped without RUN_DB_TESTS=1.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyBase64 } from "@/lib/crypto";
import { connect, DB_TESTS_ENABLED, deleteFixture, prepareDatabase, runAs, SKIP_MESSAGE, type Sql } from "./helpers/db";

process.env.FIELD_ENCRYPTION_KEY ||= generateKeyBase64();

import { getSql } from "@/db/client";
import { addOwnEntry, appendTurn, avatarRatings, closeThread, createThread, getOwnThread, listOpenQuestions, listOwnEntries, listTurns, proposeEntries, rateTurn, ratifyEntry, rejectEntry, removeEntry, saveNextTimeQuestions, setThreadDepth, listPanels, versionRatings, deleteSandbox, listSandboxes, addVoiceSample, listVoiceSamples, removeVoiceSample, listOwnAnswers, listCorrections, rateTurnContent, saveCorrection } from "@/lib/data";
import { threadsToReturnTo } from "@/lib/biographer/inputs";

const suite = DB_TESTS_ENABLED ? describe : describe.skip;

suite(`biographer data ${DB_TESTS_ENABLED ? "" : SKIP_MESSAGE}`, () => {
  let sql: Sql;
  const A = randomUUID();
  const B = randomUUID();
  let coupleId = "";

  beforeAll(async () => {
    sql = connect();
    await prepareDatabase(sql);
    await sql`insert into users (id, auth_provider_id, display_name) values (${A}, ${A}, 'A'), (${B}, ${B}, 'B')`;
    const [couple] = await sql<Array<{ id: string }>>`insert into couples (partner_a_id, partner_b_id, status) values (${A}, ${B}, 'active') returning id`;
    coupleId = couple.id;
  });

  afterAll(async () => {
    await deleteFixture(sql, [A, B], [coupleId]);
    await sql.end();
    await getSql().end();
  });

  it("stores turns in order, encrypted at rest, and only the owner can read them", async () => {
    const thread = await createThread({ userId: A, kind: "biographer", focus: "money" });
    await appendTurn({ threadId: thread.id, userId: A, role: "guide", text: "Who handled the money?", note: "An opening question.", meta: { kind: "open" } });
    await appendTurn({ threadId: thread.id, userId: A, role: "person", text: "My mother did, and we never spoke of it." });
    const turns = await listTurns(thread.id, A);
    expect(turns.map((t) => [t.seq, t.role, t.text])).toEqual([
      [1, "guide", "Who handled the money?"],
      [2, "person", "My mother did, and we never spoke of it."],
    ]);
    expect(turns[0].note).toBe("An opening question.");

    const raw = await sql<Array<{ content_enc: Buffer }>>`select content_enc from conversation_turns where thread_id = ${thread.id} order by seq`;
    expect(raw).toHaveLength(2);
    for (const r of raw) expect(Buffer.from(r.content_enc).toString("utf8")).not.toMatch(/mother|money/);

    expect(await getOwnThread(thread.id, B)).toBeNull();
    expect(await listTurns(thread.id, B)).toEqual([]);
    await expect(appendTurn({ threadId: thread.id, userId: B, role: "person", text: "not mine" })).rejects.toThrow();
  });

  it("a line enters a document only by ratification, and the owner can amend, reject or strike it", async () => {
    const thread = await createThread({ userId: A, kind: "biographer", focus: "money" });
    const [first, second] = await proposeEntries({
      userId: A,
      threadId: thread.id,
      entries: [
        { document: "constitution", section: "values", text: "I value openness about money.", mark: "open", in_their_words: false, source_turns: [2] },
        { document: "constitution", section: "fears", text: "I fear being a burden.", mark: "open", in_their_words: false, source_turns: [4] },
      ],
    });
    expect((await listOwnEntries(A, { status: "ratified" })).map((e) => e.id)).not.toContain(first.id);

    await ratifyEntry({ entryId: first.id, userId: A, text: "I want money talked about openly.", mark: "settled" });
    await rejectEntry({ entryId: second.id, userId: A });
    // Another person's id changes nothing.
    await ratifyEntry({ entryId: second.id, userId: B });

    const ratified = await listOwnEntries(A, { status: "ratified" });
    expect(ratified.find((e) => e.id === first.id)).toMatchObject({ text: "I want money talked about openly.", mark: "settled", in_their_words: true });
    expect(ratified.find((e) => e.id === second.id)).toBeUndefined();

    const own = await addOwnEntry({ userId: A, document: "constitution", section: "working_on", text: "Asking before I defend.", mark: "open" });
    expect(own.status).toBe("ratified");
    await removeEntry({ entryId: own.id, userId: A });
    expect((await listOwnEntries(A)).find((e) => e.id === own.id)).toBeUndefined();

    const raw = await sql<Array<{ text_enc: Buffer }>>`select text_enc from document_entries where user_id = ${A}`;
    for (const r of raw) expect(Buffer.from(r.text_enc).toString("utf8")).not.toMatch(/money|burden|defend/);
    expect(await listOwnEntries(B)).toEqual([]);
    await closeThread({ threadId: thread.id, userId: A, drafted: true });
    expect((await getOwnThread(thread.id, A))?.status).toBe("closed");
  });

  it("collects what the avatar could not answer, and the owner's ratings of it", async () => {
    const thread = await createThread({ userId: A, kind: "mentor", focus: null });
    await appendTurn({ threadId: thread.id, userId: A, role: "person", text: "What would I do if plans changed?" });
    const sure = await appendTurn({ threadId: thread.id, userId: A, role: "avatar", text: "I'd ask first.", meta: { unsure: false, draws_on: [] } });
    const unsure = await appendTurn({ threadId: thread.id, userId: A, role: "avatar", text: "I don't know that about us.", note: "What do you do when a plan changes at the last minute?", meta: { unsure: true, draws_on: [] } });
    expect(await listOpenQuestions(A)).toEqual(["What do you do when a plan changes at the last minute?"]);
    expect(await listOpenQuestions(B)).toEqual([]);

    await rateTurn({ turnId: sure.id, userId: A, rating: "like_me" });
    await rateTurn({ turnId: unsure.id, userId: A, rating: "not_like_me" });
    await rateTurn({ turnId: sure.id, userId: B, rating: "not_like_me" });
    expect(await avatarRatings(A)).toEqual({ like_me: 1, not_like_me: 1 });
  });

  it("keeps the depth the person chose, their option and thread labels encrypted, and the drafter's questions for next time", async () => {
    const thread = await createThread({ userId: A, kind: "biographer", focus: "money" });
    expect(thread.depth).toBe("light");
    await setThreadDepth({ threadId: thread.id, userId: B, depth: "deeper" });
    expect((await getOwnThread(thread.id, A))?.depth).toBe("light");
    await setThreadDepth({ threadId: thread.id, userId: A, depth: "deeper" });
    expect((await getOwnThread(thread.id, A))?.depth).toBe("deeper");

    await appendTurn({ threadId: thread.id, userId: A, role: "person", text: "A long answer about Leeds and my brother." });
    await appendTurn({ threadId: thread.id, userId: A, role: "guide", text: "Tell me about the tin.", extras: { options: ["I hid my pocket money"], threads: ["my brother's loan"] }, meta: { kind: "follow_up", aim: "moment" } });
    const turns = await listTurns(thread.id, A);
    expect(turns[1].extras).toMatchObject({ options: ["I hid my pocket money"], threads: ["my brother's loan"] });
    expect(turns[0].extras).toBeNull();
    expect(threadsToReturnTo(turns)).toEqual(["my brother's loan"]);
    const [raw] = await sql<Array<{ extras_enc: Buffer; meta: unknown }>>`select extras_enc, meta from conversation_turns where thread_id = ${thread.id} and seq = 2`;
    expect(raw.extras_enc.toString("utf8")).not.toContain("brother");
    expect(JSON.stringify(raw.meta)).not.toMatch(/brother|pocket/);

    const before = await listOpenQuestions(A, 20);
    await saveNextTimeQuestions({ threadId: thread.id, userId: A, questions: ["  What did a good week with money look like in your first flat?  ", "", "Who taught you to save?"] });
    const after = await listOpenQuestions(A, 20);
    expect(after).toHaveLength(before.length + 2);
    expect(after).toContain("What did a good week with money look like in your first flat?");
    expect(after).toContain("Who taught you to save?");
    expect(await listOpenQuestions(B, 20)).toEqual([]);
    // They are stored with the thread and marked, so the transcript and the model can leave them out.
    expect((await listTurns(thread.id, A)).filter((t) => t.meta.kind === "next_time")).toHaveLength(2);
  });

  it("keeps a panel of versions: three-way verdicts tallied per version, apart from the one-notch-ahead ratings", async () => {
    const before = await avatarRatings(A);
    const thread = await createThread({ userId: A, kind: "panel", focus: null });
    await appendTurn({ threadId: thread.id, userId: A, role: "person", text: "Ana wants to go through the card statement tonight." });
    const plain = await appendTurn({ threadId: thread.id, userId: A, role: "avatar", text: "I'd tell her first.", extras: { options: [], threads: [], opening_line: "There's a charge I should have told you about.", change: "Nothing is changed." }, meta: { version: "as_you_are", draws_on: [], unsure: false } });
    const tired = await appendTurn({ threadId: thread.id, userId: A, role: "avatar", text: "I'd ask to do it at the weekend.", extras: { options: [], threads: [], opening_line: null, change: "Your state: four hours of sleep." }, meta: { version: "depleted", draws_on: [], unsure: false } });
    await appendTurn({ threadId: thread.id, userId: A, role: "guide", text: "Which is closer to the nights that go badly?", extras: { options: [], threads: [], reading: { same: ["Every version tells her."], differs: [{ observation: "The version short on sleep asks to move it.", versions: ["depleted"] }] } }, meta: { kind: "panel_reading" } });

    await rateTurn({ turnId: plain.id, userId: A, rating: "like_me" });
    await rateTurn({ turnId: tired.id, userId: A, rating: "bad_day" });
    await rateTurn({ turnId: tired.id, userId: B, rating: "not_like_me" });
    expect(await versionRatings(A)).toEqual({ as_you_are: { like_me: 1, bad_day: 0, not_like_me: 0 }, depleted: { like_me: 0, bad_day: 1, not_like_me: 0 } });
    expect(await versionRatings(B)).toEqual({});
    // Verdicts on panel versions do not leak into the self-recognition count for the one-notch-ahead avatar.
    expect(await avatarRatings(A)).toEqual(before);

    const turns = await listTurns(thread.id, A);
    expect(turns[1].extras).toMatchObject({ opening_line: "There's a charge I should have told you about.", change: "Nothing is changed." });
    expect(turns[3].extras?.reading).toEqual({ same: ["Every version tells her."], differs: [{ observation: "The version short on sleep asks to move it.", versions: ["depleted"] }] });
    const [raw] = await sql<Array<{ extras_enc: Buffer; meta: unknown }>>`select extras_enc, meta from conversation_turns where id = ${plain.id}`;
    expect(raw.extras_enc.toString("utf8")).not.toContain("charge");
    expect(JSON.stringify(raw.meta)).not.toMatch(/charge|statement/);

    const panels = await listPanels(A);
    expect(panels[0]).toMatchObject({ id: thread.id, situation: "Ana wants to go through the card statement tonight." });
    expect(await listPanels(B)).toEqual([]);
  });

  it("keeps how a person writes: pasted samples, corrections and a second verdict, all encrypted and all the owner's", async () => {
    const sample = await addVoiceSample({ userId: A, register: "heated", text: "  fine.\nI said fine  " });
    expect(sample).toMatchObject({ register: "heated", text: "fine.\nI said fine", words: 4 });
    await addVoiceSample({ userId: A, register: "everyday", text: "on my way. ten mins" });
    expect((await listVoiceSamples(A)).map((v) => v.register).sort()).toEqual(["everyday", "heated"]);
    expect(await listVoiceSamples(B)).toEqual([]);
    const [raw] = await sql<Array<{ text_enc: Buffer }>>`select text_enc from voice_samples where id = ${sample.id}`;
    expect(raw.text_enc.toString("utf8")).not.toContain("fine");

    // Removing a sample overwrites the words, and the partner cannot remove it.
    await removeVoiceSample({ sampleId: sample.id, userId: B });
    expect(await listVoiceSamples(A)).toHaveLength(2);
    await removeVoiceSample({ sampleId: sample.id, userId: A });
    expect((await listVoiceSamples(A)).map((v) => v.register)).toEqual(["everyday"]);
    const [gone] = await sql<Array<{ words: number; deleted_at: Date | null }>>`select words, deleted_at from voice_samples where id = ${sample.id}`;
    expect(gone.words).toBe(0);
    expect(gone.deleted_at).not.toBeNull();

    const bio = await createThread({ userId: A, kind: "biographer", focus: "money" });
    await appendTurn({ threadId: bio.id, userId: A, role: "guide", text: "Who handled the money?" });
    await appendTurn({ threadId: bio.id, userId: A, role: "person", text: "dad did. nobody talked about it" });
    const mentor = await createThread({ userId: A, kind: "mentor", focus: null });
    await appendTurn({ threadId: mentor.id, userId: A, role: "person", text: "What would I do about the card bill?" });
    const reply = await appendTurn({ threadId: mentor.id, userId: A, role: "avatar", text: "What has helped me lately is pausing first.", meta: { draws_on: [], unsure: false } });
    // Only what they wrote to the biographer counts as their considered register; what they asked an avatar does not.
    expect(await listOwnAnswers(A)).toContain("dad did. nobody talked about it");
    expect(await listOwnAnswers(A)).not.toContain("What would I do about the card bill?");
    expect(await listOwnAnswers(B)).toEqual([]);

    await rateTurnContent({ turnId: reply.id, userId: A, rating: "would_not_say" });
    await saveCorrection({ turnId: reply.id, userId: A, text: "honestly i just wait a sec" });
    await saveCorrection({ turnId: reply.id, userId: B, text: "written by someone else" });
    const stored = (await listTurns(mentor.id, A)).find((t) => t.id === reply.id)!;
    expect(stored).toMatchObject({ contentRating: "would_not_say", correction: "honestly i just wait a sec", rating: null });
    expect(await listCorrections(A)).toContainEqual({ said: "What has helped me lately is pausing first.", wouldSay: "honestly i just wait a sec" });
    expect(await listCorrections(B)).toEqual([]);
    const [enc] = await sql<Array<{ correction_enc: Buffer }>>`select correction_enc from conversation_turns where id = ${reply.id}`;
    expect(enc.correction_enc.toString("utf8")).not.toContain("honestly");
    await saveCorrection({ turnId: reply.id, userId: A, text: "  " });
    expect((await listCorrections(A)).some((c) => c.said === "What has helped me lately is pausing first.")).toBe(false);
  });

  it("a sandbox is a private thread whose first turn is its scenario, and deleting it overwrites every word", async () => {
    const thread = await createThread({ userId: A, kind: "sandbox", focus: null });
    await appendTurn({ threadId: thread.id, userId: A, role: "guide", text: JSON.stringify({ a: { name: "Mara" }, situation: "The doorbell goes." }), meta: { kind: "scenario" } });
    const said = await appendTurn({ threadId: thread.id, userId: A, role: "avatar", text: JSON.stringify({ says: "Are you getting that?", does: null }), meta: { kind: "turn", side: "b", move: "asks" } });
    expect((await listSandboxes(A)).find((b) => b.id === thread.id)?.scenario).toContain("doorbell");
    expect(await listSandboxes(B)).toEqual([]);
    const [raw] = await sql<Array<{ content_enc: Buffer }>>`select content_enc from conversation_turns where id = ${said.id}`;
    expect(raw.content_enc.toString("utf8")).not.toContain("getting that");

    expect(await deleteSandbox({ threadId: thread.id, userId: B })).toBe(false);
    expect(await deleteSandbox({ threadId: thread.id, userId: A })).toBe(true);
    expect((await listSandboxes(A)).some((b) => b.id === thread.id)).toBe(false);
    expect(await getOwnThread(thread.id, A)).toBeNull();
    const rows = await sql<Array<{ meta: unknown; deleted_at: Date | null }>>`select meta, deleted_at from conversation_turns where thread_id = ${thread.id}`;
    expect(rows.every((r) => r.deleted_at !== null && JSON.stringify(r.meta) === "{}")).toBe(true);
  });

  it("row-level security hides every table from the partner and from anonymous sessions", async () => {
    const counts = (tx: Parameters<Parameters<typeof runAs>[2]>[0]) =>
      Promise.all([tx`select count(*)::int as n from conversation_threads`, tx`select count(*)::int as n from conversation_turns`, tx`select count(*)::int as n from document_entries`, tx`select count(*)::int as n from voice_samples`]).then((r) => r.map((x) => x[0].n));
    const asOwner = await runAs(sql, A, counts);
    expect(asOwner.every((n) => n > 0)).toBe(true);
    expect(await runAs(sql, B, counts)).toEqual([0, 0, 0, 0]);
    expect(await runAs(sql, null, counts)).toEqual([0, 0, 0, 0]);
    // The partner cannot plant a line in someone else's document, or a sample in their voice, either.
    await expect(runAs(sql, B, (tx) => tx`insert into voice_samples (user_id, register, text_enc, words) values (${A}, 'everyday', ${Buffer.from([1, 2, 3])}, 3)`)).rejects.toThrow();
    await expect(runAs(sql, B, (tx) => tx`insert into document_entries (user_id, document, section, text_enc) values (${A}, 'constitution', 'values', ${Buffer.from([1, 2, 3])})`)).rejects.toThrow();
  });
});
