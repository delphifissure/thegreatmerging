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
import { addOwnEntry, appendTurn, avatarRatings, closeThread, createThread, getOwnThread, listOpenQuestions, listOwnEntries, listTurns, proposeEntries, rateTurn, ratifyEntry, rejectEntry, removeEntry } from "@/lib/data";

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

  it("row-level security hides every table from the partner and from anonymous sessions", async () => {
    const counts = (tx: Parameters<Parameters<typeof runAs>[2]>[0]) =>
      Promise.all([tx`select count(*)::int as n from conversation_threads`, tx`select count(*)::int as n from conversation_turns`, tx`select count(*)::int as n from document_entries`]).then((r) => r.map((x) => x[0].n));
    const asOwner = await runAs(sql, A, counts);
    expect(asOwner.every((n) => n > 0)).toBe(true);
    expect(await runAs(sql, B, counts)).toEqual([0, 0, 0]);
    expect(await runAs(sql, null, counts)).toEqual([0, 0, 0]);
    // The partner cannot plant a line in someone else's document either.
    await expect(runAs(sql, B, (tx) => tx`insert into document_entries (user_id, document, section, text_enc) values (${A}, 'constitution', 'values', ${Buffer.from([1, 2, 3])})`)).rejects.toThrow();
  });
});
