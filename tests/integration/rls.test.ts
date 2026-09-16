/**
 * Row-level security integration test (db/migrations/0001_rls.sql) against a real Postgres.
 *
 * HOW TO RUN
 *   createdb the_plan_test
 *   DATABASE_URL=postgresql://localhost/the_plan_test RUN_DB_TESTS=1 ./node_modules/.bin/vitest run tests/integration
 *
 * Requirements
 *   - The database must be EMPTY on the first run. db/migrations (schema + RLS + later migrations)
 *     are applied once through the drizzle migrator, which records what it applied; later runs
 *     reuse the migrated database. Drop and recreate it to start over.
 *   - The connecting role must own the tables (it ran the migrations) and be able to create the
 *     nologin role `app_user` (superuser, or CREATEROLE). On plain Postgres the migration installs
 *     an auth.uid() shim that reads the `request.jwt.claim.sub` setting, which is what Supabase's
 *     authenticated role provides from the JWT.
 *   - Each block runs `set local role app_user` plus `set_config('request.jwt.claim.sub', <uuid>, true)`
 *     inside a transaction and `reset role` afterwards; fixture rows are inserted as the owner
 *     (RLS does not apply to the owner) and removed in afterAll.
 * Without RUN_DB_TESTS=1 and DATABASE_URL this file is skipped.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, DB_TESTS_ENABLED, deleteFixture, prepareDatabase, runAs, SKIP_MESSAGE, type Sql } from "./helpers/db";

const suite = DB_TESTS_ENABLED ? describe : describe.skip;

suite(`row-level security ${DB_TESTS_ENABLED ? "" : SKIP_MESSAGE}`, () => {
  let sql: Sql;
  const A = randomUUID();
  const B = randomUUID();
  const C = randomUUID();
  let coupleId = "";
  let runId = "";
  let briefId = "";
  const enc = (n: number) => Buffer.from([1, ...Array.from({ length: 12 + 16 + 2 }, (_, i) => (i * 7 + n) % 256)]);

  const setConsent = (userId: string, patch: { relationship?: boolean; mental?: boolean }) =>
    sql`update consent_settings set
          share_relationship_scores = coalesce(${patch.relationship ?? null}, share_relationship_scores),
          share_mental_health_scores = coalesce(${patch.mental ?? null}, share_mental_health_scores)
        where user_id = ${userId} and couple_id = ${coupleId}`;

  beforeAll(async () => {
    sql = connect();
    await prepareDatabase(sql);

    await sql`insert into users (id, auth_provider_id, display_name) values (${A}, ${A}, 'A'), (${B}, ${B}, 'B'), (${C}, ${C}, 'C')`;
    const [couple] = await sql<Array<{ id: string }>>`insert into couples (partner_a_id, partner_b_id, status) values (${A}, ${B}, 'active') returning id`;
    coupleId = couple.id;
    await sql`insert into consent_settings (user_id, couple_id, share_relationship_scores, share_mental_health_scores)
              values (${A}, ${coupleId}, true, false), (${B}, ${coupleId}, false, true)`;

    // Responses: one plaintext relationship item and one encrypted PHQ-9 item per partner.
    await sql`insert into responses (user_id, couple_id, instrument_key, item_id, pass, value, value_enc) values
      (${A}, ${coupleId}, 'csi16', 'csi16_1', 'single', 4, null),
      (${A}, ${coupleId}, 'phq9', 'phq9_1', 'single', null, ${enc(1)}),
      (${B}, ${coupleId}, 'csi16', 'csi16_1', 'single', 5, null),
      (${B}, ${coupleId}, 'phq9', 'phq9_1', 'single', null, ${enc(2)})`;

    const [run] = await sql<Array<{ id: string }>>`insert into interpretation_runs (couple_id, status, input_hash, rules_version) values (${coupleId}, 'complete', 'hash', '1.0.0') returning id`;
    runId = run.id;
    await sql`insert into scores (run_id, user_id, couple_id, instrument_key, subscale, value, value_enc, cutoff_label, scoring_version) values
      (${runId}, ${A}, ${coupleId}, 'csi16', 'total', 70, null, 'non_distressed', '1.0.0'),
      (${runId}, ${A}, ${coupleId}, 'phq9', 'total', null, ${enc(3)}, 'moderate', '1.0.0'),
      (${runId}, ${B}, ${coupleId}, 'csi16', 'total', 60, null, 'non_distressed', '1.0.0'),
      (${runId}, ${B}, ${coupleId}, 'phq9', 'total', null, ${enc(4)}, 'mild', '1.0.0')`;
    await sql`insert into couple_scores (run_id, couple_id, metric, value, details) values (${runId}, ${coupleId}, 'wdw_now_disagreement', 0, '{}'::jsonb)`;
    await sql`insert into flags (run_id, couple_id, domain, rule_key, triggered_by, weight) values (${runId}, ${coupleId}, 'household', 'needs_context', '{}'::jsonb, 1)`;

    // Color layer: sessions per partner and domain, answers with and without the verbatim flag.
    const sessions = await sql<Array<{ id: string; user_id: string; domain: string }>>`insert into color_sessions (user_id, couple_id, domain, state) values
      (${A}, ${coupleId}, 'household', '{}'::jsonb), (${A}, ${coupleId}, 'parenting', '{}'::jsonb),
      (${B}, ${coupleId}, 'household', '{}'::jsonb), (${B}, ${coupleId}, 'parenting', '{}'::jsonb) returning id, user_id, domain`;
    const session = (user: string, domain: string) => sessions.find((s) => s.user_id === user && s.domain === domain)!.id;
    await sql`insert into color_answers (session_id, user_id, couple_id, step, question_id, question_text, answer_text, shareable_verbatim) values
      (${session(A, "household")}, ${A}, ${coupleId}, 'specifics', 'household_s1', 'Q', 'A household shareable', true),
      (${session(A, "household")}, ${A}, ${coupleId}, 'preference', 'household_p2', 'Q', 'A household private', false),
      (${session(A, "parenting")}, ${A}, ${coupleId}, 'specifics', 'parenting_s1', 'Q', 'A parenting shareable (no brief)', true),
      (${session(B, "household")}, ${B}, ${coupleId}, 'specifics', 'household_s1', 'Q', 'B household shareable', true),
      (${session(B, "household")}, ${B}, ${coupleId}, 'preference', 'household_p2', 'Q', 'B household private', false)`;
    await sql`insert into tags (user_id, couple_id, domain, item_ref, tag, comment) values
      (${A}, ${coupleId}, 'household', 'household_t3', 'requirement', 'Ask first.'),
      (${B}, ${coupleId}, 'parenting', 'parenting_t8', 'preference', 'Either way.')`;
    const [brief] = await sql<Array<{ id: string }>>`insert into briefs (couple_id, run_id, domain, content, interpreter_version, input_hash) values (${coupleId}, ${runId}, 'household', '{}'::jsonb, 'interpreter.v1', 'hash') returning id`;
    briefId = brief.id;
    await sql`insert into profiles (user_id, couple_id, safety_note) values (${A}, ${coupleId}, 'private note'), (${B}, ${coupleId}, null)`;
    await sql`insert into audit_log (actor_user_id, actor_kind, action, target_user_id) values
      (null, 'job', 'interpret.read_responses', ${A}),
      (${B}, 'user', 'scores.read_partner', ${A}),
      (${C}, 'user', 'couple.create', ${C})`;
    await sql`insert into llm_calls (couple_id, user_id, role, model, prompt_version, input_hash) values (${coupleId}, ${A}, 'guardrail', 'claude-haiku-4-5-20251001', 'guardrail.v1', 'hash')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await deleteFixture(sql, [A, B, C], coupleId ? [coupleId] : []);
    await sql.end();
  });

  const rows = async <T,>(userId: string | null, query: (tx: Parameters<Parameters<typeof runAs>[2]>[0]) => Promise<T[]>): Promise<T[]> => runAs(sql, userId, query);

  it("responses: a user sees only their own rows, never the partner's", async () => {
    const forA = await rows<{ user_id: string; item_id: string }>(A, (tx) => tx`select user_id, item_id from responses order by item_id`);
    expect(forA).toEqual([
      { user_id: A, item_id: "csi16_1" },
      { user_id: A, item_id: "phq9_1" },
    ]);
    const forB = await rows<{ user_id: string }>(B, (tx) => tx`select user_id from responses`);
    expect(forB.every((r) => r.user_id === B)).toBe(true);
    expect(forB).toHaveLength(2);
  });

  it("responses: a user cannot insert a row for the partner", async () => {
    await expect(
      runAs(sql, A, (tx) => tx`insert into responses (user_id, couple_id, instrument_key, item_id, pass, value) values (${B}, ${coupleId}, 'csi16', 'csi16_2', 'single', 1)`),
    ).rejects.toThrow(/row-level security/);
  });

  it("scores: the partner's relationship score is visible only when the partner shares relationship scores", async () => {
    // B does not share relationship scores: A sees no csi16 row of B's.
    let seenByA = await rows<{ instrument_key: string }>(A, (tx) => tx`select instrument_key from scores where user_id = ${B} order by instrument_key`);
    expect(seenByA.map((r) => r.instrument_key)).not.toContain("csi16");
    // A shares relationship scores: B sees A's csi16.
    const seenByB = await rows<{ instrument_key: string }>(B, (tx) => tx`select instrument_key from scores where user_id = ${A} order by instrument_key`);
    expect(seenByB.map((r) => r.instrument_key)).toEqual(["csi16"]);
    await setConsent(B, { relationship: true });
    try {
      seenByA = await rows(A, (tx) => tx`select instrument_key from scores where user_id = ${B} order by instrument_key`);
      expect(seenByA.map((r) => r.instrument_key)).toContain("csi16");
    } finally {
      await setConsent(B, { relationship: false });
    }
  });

  it("scores: the partner's PHQ-9 score is visible only when the partner shares mental-health scores", async () => {
    // B shares mental-health scores: A sees B's phq9. A does not: B never sees A's phq9.
    const seenByA = await rows<{ instrument_key: string }>(A, (tx) => tx`select instrument_key from scores where user_id = ${B}`);
    expect(seenByA.map((r) => r.instrument_key)).toEqual(["phq9"]);
    let seenByB = await rows<{ instrument_key: string }>(B, (tx) => tx`select instrument_key from scores where user_id = ${A}`);
    expect(seenByB.map((r) => r.instrument_key)).not.toContain("phq9");
    await setConsent(A, { mental: true });
    try {
      seenByB = await rows(B, (tx) => tx`select instrument_key from scores where user_id = ${A} order by instrument_key`);
      expect(seenByB.map((r) => r.instrument_key)).toEqual(["csi16", "phq9"]);
    } finally {
      await setConsent(A, { mental: false });
    }
  });

  it("scores: a user always sees their own rows", async () => {
    const own = await rows<{ instrument_key: string }>(A, (tx) => tx`select instrument_key from scores where user_id = ${A} order by instrument_key`);
    expect(own.map((r) => r.instrument_key)).toEqual(["csi16", "phq9"]);
  });

  it("couple_scores and flags are visible only when both partners share relationship scores", async () => {
    for (const u of [A, B]) {
      expect(await rows(u, (tx) => tx`select id from couple_scores where couple_id = ${coupleId}`)).toEqual([]);
      expect(await rows(u, (tx) => tx`select id from flags where couple_id = ${coupleId}`)).toEqual([]);
    }
    await setConsent(B, { relationship: true });
    try {
      for (const u of [A, B]) {
        expect(await rows(u, (tx) => tx`select id from couple_scores where couple_id = ${coupleId}`)).toHaveLength(1);
        expect(await rows(u, (tx) => tx`select id from flags where couple_id = ${coupleId}`)).toHaveLength(1);
      }
      expect(await rows(C, (tx) => tx`select id from couple_scores`)).toEqual([]);
    } finally {
      await setConsent(B, { relationship: false });
    }
  });

  it("color_answers: the partner's answers are visible only when shareable_verbatim and a brief exists for that domain", async () => {
    const seenByB = await rows<{ answer_text: string; user_id: string }>(B, (tx) => tx`select answer_text, user_id from color_answers where user_id = ${A} order by answer_text`);
    expect(seenByB.map((r) => r.answer_text)).toEqual(["A household shareable"]);
    const seenByA = await rows<{ answer_text: string }>(A, (tx) => tx`select answer_text from color_answers where user_id = ${B} order by answer_text`);
    expect(seenByA.map((r) => r.answer_text)).toEqual(["B household shareable"]);
    const ownA = await rows<{ answer_text: string }>(A, (tx) => tx`select answer_text from color_answers where user_id = ${A}`);
    expect(ownA).toHaveLength(3);
    // Soft-deleting the brief hides the partner's answer again.
    await sql`update briefs set deleted_at = now() where id = ${briefId}`;
    try {
      expect(await rows(B, (tx) => tx`select id from color_answers where user_id = ${A}`)).toEqual([]);
    } finally {
      await sql`update briefs set deleted_at = null where id = ${briefId}`;
    }
  });

  it("tags: the partner's tags are visible only once the brief for that domain exists", async () => {
    const seenByB = await rows<{ item_ref: string }>(B, (tx) => tx`select item_ref from tags where user_id = ${A}`);
    expect(seenByB.map((r) => r.item_ref)).toEqual(["household_t3"]);
    const seenByA = await rows<{ item_ref: string }>(A, (tx) => tx`select item_ref from tags where user_id = ${B}`);
    expect(seenByA).toEqual([]);
  });

  it("a third unrelated user sees nothing of the couple", async () => {
    for (const table of ["responses", "scores", "couple_scores", "flags", "color_answers", "color_sessions", "tags", "briefs", "consent_settings", "interpretation_runs", "instrument_completions"]) {
      const seen = await runAs(sql, C, (tx) => tx.unsafe(`select 1 from ${table}`));
      expect(seen, table).toHaveLength(0);
    }
    expect(await rows(C, (tx) => tx`select id from couples where id = ${coupleId}`)).toEqual([]);
    expect(await rows(C, (tx) => tx`select id from users order by id`)).toEqual([{ id: C }]);
    expect(await rows(C, (tx) => tx`select user_id from profiles`)).toEqual([]);
  });

  it("partners see each other in users and the couple row; consent rows and profiles stay private", async () => {
    const usersForA = await rows<{ id: string }>(A, (tx) => tx`select id from users order by id`);
    expect(usersForA.map((u) => u.id).sort()).toEqual([A, B].sort());
    expect(await rows(A, (tx) => tx`select id from couples where id = ${coupleId}`)).toEqual([{ id: coupleId }]);
    expect(await rows(A, (tx) => tx`select user_id from consent_settings`)).toEqual([{ user_id: A }]);
    expect(await rows(B, (tx) => tx`select user_id from profiles`)).toEqual([{ user_id: B }]);
    expect(await rows(B, (tx) => tx`select safety_note from profiles where user_id = ${A}`)).toEqual([]);
    expect(await rows(A, (tx) => tx`select id from briefs`)).toEqual([{ id: briefId }]);
    expect(await rows(B, (tx) => tx`select id from briefs`)).toEqual([{ id: briefId }]);
  });

  it("llm_calls and llm_memo are not readable by any user", async () => {
    for (const u of [A, B, C]) {
      expect(await rows(u, (tx) => tx`select id from llm_calls`)).toEqual([]);
      expect(await rows(u, (tx) => tx`select role from llm_memo`)).toEqual([]);
    }
  });

  it("audit_log rows are visible only where the user is the target or the actor", async () => {
    const forA = await rows<{ action: string }>(A, (tx) => tx`select action from audit_log order by action`);
    expect(forA.map((r) => r.action)).toEqual(["interpret.read_responses", "scores.read_partner"]);
    const forB = await rows<{ action: string }>(B, (tx) => tx`select action from audit_log`);
    expect(forB.map((r) => r.action)).toEqual(["scores.read_partner"]);
    const forC = await rows<{ action: string }>(C, (tx) => tx`select action from audit_log`);
    expect(forC.map((r) => r.action)).toEqual(["couple.create"]);
    // No session (auth.uid() null) sees nothing.
    expect(await rows(null, (tx) => tx`select id from audit_log`)).toEqual([]);
  });

  it("role is reset after each block", async () => {
    const [{ current_user: me }] = await sql<Array<{ current_user: string }>>`select current_user`;
    expect(me).not.toBe("app_user");
  });
});
