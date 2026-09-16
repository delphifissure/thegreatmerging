/**
 * lib/data against a real Postgres: encryption at rest for mental-health responses, the PHQ-9
 * item 9 safety rule, completion gating, consent change logging, consent-gated partner reads with
 * audit rows, invitation acceptance, plan versioning with revisits, and therapist share links.
 *
 * HOW TO RUN
 *   createdb the_plan_test
 *   DATABASE_URL=postgresql://localhost/the_plan_test RUN_DB_TESTS=1 ./node_modules/.bin/vitest run tests/integration
 *
 * The database must be empty on the first run (migrations are applied through the drizzle
 * migrator and recorded). FIELD_ENCRYPTION_KEY is generated for the process when unset.
 * Without RUN_DB_TESTS=1 and DATABASE_URL this file is skipped.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyBase64 } from "@/lib/crypto";
import { connect, DB_TESTS_ENABLED, deleteFixture, prepareDatabase, SKIP_MESSAGE, type Sql } from "./helpers/db";

process.env.FIELD_ENCRYPTION_KEY ||= generateKeyBase64();

import { getSql } from "@/db/client";
import type { Stage1Output } from "@/lib/interpretation/stage1";
import type { Score } from "@/instruments/schema";
import {
  acceptInvitation,
  createCouple,
  createInvitation,
  createOrGetRun,
  createTherapistShare,
  ensureUser,
  getConsent,
  getCouple,
  getDueRevisits,
  getLatestPlan,
  getOwnScores,
  getPartnerScoresForViewer,
  getProfile,
  getScoresForJob,
  InvitationError,
  listResponses,
  listRevisits,
  markInstrumentComplete,
  persistProfile,
  persistStage1,
  ResponseWriteError,
  resolveTherapistShare,
  revokeTherapistShare,
  SAFETY_RESOURCE_MESSAGE,
  savePlanVersion,
  updateConsent,
  writeResponse,
} from "@/lib/data";

const suite = DB_TESTS_ENABLED ? describe : describe.skip;

suite(`lib/data module ${DB_TESTS_ENABLED ? "" : SKIP_MESSAGE}`, () => {
  let sql: Sql;
  const A = randomUUID();
  const B = randomUUID();
  const A2 = randomUUID();
  const coupleIds: string[] = [];
  let coupleId = "";

  const score = (instrument_key: string, subscale: string, value: number, cutoff_label: string | null): Score => ({ instrument_key, subscale, value, cutoff_label, scoring_version: "1.0.0" });

  beforeAll(async () => {
    sql = connect();
    await prepareDatabase(sql);
    await ensureUser({ id: A, displayName: "A" });
    await ensureUser({ id: B, displayName: "B" });
    await ensureUser({ id: A2, displayName: "A2" });
    const couple = await createCouple({ partnerAId: A, hasChildren: false });
    coupleId = couple.id;
    coupleIds.push(coupleId);
    const { token } = await createInvitation({ coupleId, invitedBy: A, email: "B@Example.com" });
    await acceptInvitation({ token, userId: B });
  });

  afterAll(async () => {
    if (sql) {
      await deleteFixture(sql, [A, B, A2], coupleIds);
      await sql.end();
    }
    await getSql().end();
  });

  it("acceptInvitation activates the couple and rejects reuse or self-acceptance", async () => {
    const couple = await getCouple(coupleId);
    expect(couple).toMatchObject({ status: "active", partner_a_id: A, partner_b_id: B });
    const [inv] = await sql<Array<{ accepted_by: string; email: string }>>`select accepted_by, email from invitations where couple_id = ${coupleId}`;
    expect(inv).toEqual({ accepted_by: B, email: "b@example.com" });
    // Consent rows exist for both partners with the private-by-default settings.
    const consentB = await getConsent(B, coupleId);
    expect(consentB).toMatchObject({ share_relationship_scores: true, share_mental_health_scores: false, share_written_answers_verbatim: false });

    const other = await createCouple({ partnerAId: A2, hasChildren: true });
    coupleIds.push(other.id);
    const { token } = await createInvitation({ coupleId: other.id, invitedBy: A2, email: "x@example.com" });
    await expect(acceptInvitation({ token, userId: A2 })).rejects.toThrow(InvitationError);
    await expect(acceptInvitation({ token, userId: A2 })).rejects.toThrow(/your own invitation/);
    await expect(acceptInvitation({ token: "not-a-token", userId: B })).rejects.toThrow(/not found/);
    const activated = await acceptInvitation({ token, userId: B });
    expect(activated.status).toBe("active");
    await expect(acceptInvitation({ token, userId: B })).rejects.toThrow(/already accepted/);
  });

  it("writeResponse stores PHQ-9 values encrypted (value NULL, value_enc set) and listResponses decrypts", async () => {
    const res = await writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: "phq9_1", value: 2 });
    expect(res).toEqual({ safetyFlag: false });
    const [raw] = await sql<Array<{ value: number | null; value_enc: Buffer | null; pass: string }>>`select value, value_enc, pass from responses where user_id = ${A} and instrument_key = 'phq9' and item_id = 'phq9_1'`;
    expect(raw.value).toBeNull();
    expect(raw.value_enc).not.toBeNull();
    expect(Buffer.isBuffer(raw.value_enc) ? raw.value_enc.length : 0).toBeGreaterThan(1 + 12 + 16);
    expect(raw.pass).toBe("single");
    expect(await listResponses(A, coupleId, "phq9")).toEqual([{ item_id: "phq9_1", value: 2, pass: "single", needs_context: false }]);

    // Rewriting the same item updates in place.
    await writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: "phq9_1", value: 3 });
    expect(await listResponses(A, coupleId, "phq9")).toEqual([{ item_id: "phq9_1", value: 3, pass: "single", needs_context: false }]);

    // Relationship instruments are stored in the clear.
    await writeResponse({ userId: A, coupleId, instrumentKey: "csi16", itemId: "csi16_1", value: 4, needsContext: true });
    const [plain] = await sql<Array<{ value: number | null; value_enc: Buffer | null }>>`select value, value_enc from responses where user_id = ${A} and instrument_key = 'csi16' and item_id = 'csi16_1'`;
    expect(plain).toEqual({ value: 4, value_enc: null });
    expect(await listResponses(A, coupleId, "csi16")).toEqual([{ item_id: "csi16_1", value: 4, pass: "single", needs_context: true }]);

    await expect(writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: "phq9_1", value: 9 })).rejects.toThrow(ResponseWriteError);
    await expect(writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: "nope", value: 1 })).rejects.toThrow(/unknown item/);
  });

  it("PHQ-9 item 9 above zero returns the safety flag and writes a private profile note", async () => {
    const res = await writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: "phq9_9", value: 1 });
    expect(res).toEqual({ safetyFlag: true, safetyMessage: SAFETY_RESOURCE_MESSAGE });
    const profile = await getProfile(A);
    expect(profile?.safety_note).toBe(SAFETY_RESOURCE_MESSAGE);
    expect(profile?.safety_note_at).toBeInstanceOf(Date);
    const audits = await sql<Array<{ action: string; target_user_id: string }>>`select action, target_user_id from audit_log where actor_user_id = ${A} and action = 'safety.phq9_item9'`;
    expect(audits).toEqual([{ action: "safety.phq9_item9", target_user_id: A }]);
    expect(await writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: "phq9_9", value: 0 })).toEqual({ safetyFlag: false });
  });

  it("markInstrumentComplete throws while items are missing and records completion once all are answered", async () => {
    await expect(markInstrumentComplete(A, coupleId, "phq9")).rejects.toThrow(/not complete/);
    for (const n of [2, 3, 4, 5, 6, 7, 8]) await writeResponse({ userId: A, coupleId, instrumentKey: "phq9", itemId: `phq9_${n}`, value: 0 });
    await markInstrumentComplete(A, coupleId, "phq9");
    await markInstrumentComplete(A, coupleId, "phq9"); // idempotent
    const done = await sql<Array<{ instrument_key: string }>>`select instrument_key from instrument_completions where user_id = ${A} and couple_id = ${coupleId}`;
    expect(done).toEqual([{ instrument_key: "phq9" }]);
  });

  it("updateConsent writes one consent_changes row and one audit row per changed field", async () => {
    const before = await sql<Array<{ n: string }>>`select count(*)::text as n from consent_changes where user_id = ${A}`;
    expect(Number(before[0].n)).toBe(0);
    const updated = await updateConsent(A, coupleId, { share_mental_health_scores: true, share_written_answers_verbatim: true, share_relationship_scores: true });
    expect(updated).toMatchObject({ share_mental_health_scores: true, share_written_answers_verbatim: true, share_relationship_scores: true });
    const changes = await sql<Array<{ field: string; old_value: unknown; new_value: unknown }>>`select field, old_value, new_value from consent_changes where user_id = ${A} order by field`;
    expect(changes).toEqual([
      { field: "share_mental_health_scores", old_value: false, new_value: true },
      { field: "share_written_answers_verbatim", old_value: false, new_value: true },
    ]);
    const audits = await sql<Array<{ metadata: { field: string } }>>`select metadata from audit_log where actor_user_id = ${A} and action = 'consent.change' order by created_at`;
    expect(audits.map((a) => a.metadata.field).sort()).toEqual(["share_mental_health_scores", "share_written_answers_verbatim"]);
    // No-op patch logs nothing.
    await updateConsent(A, coupleId, { share_mental_health_scores: true });
    const after = await sql<Array<{ n: string }>>`select count(*)::text as n from consent_changes where user_id = ${A}`;
    expect(Number(after[0].n)).toBe(2);
    // Restore the default for the partner-read test below.
    await updateConsent(A, coupleId, { share_mental_health_scores: false, share_written_answers_verbatim: false });
  });

  it("getPartnerScoresForViewer filters by the partner's consent, decrypts, and writes an audit row with the consent state", async () => {
    const { run } = await createOrGetRun({ coupleId, inputHash: "input-1", rulesVersion: "1.0.0" });
    const stage1: Stage1Output = {
      scores: { a: [score("csi16", "total", 70, "non_distressed"), score("phq9", "total", 12, "moderate")], b: [score("csi16", "total", 60, "non_distressed"), score("phq9", "total", 4, "minimal")] },
      derived: { a: [], b: [] },
      couple_scores: [{ metric: "wdw_now_disagreement", value: 0, details: {} }],
      flags: [],
      domains: [],
      perception_gaps: { a: [], b: [] },
      distress_context: true,
      rules_version: "1.0.0",
    };
    await persistStage1({ runId: run.id, coupleId, aId: A, bId: B, output: stage1 });
    const [rawPhq] = await sql<Array<{ value: number | null; value_enc: Buffer | null }>>`select value, value_enc from scores where run_id = ${run.id} and user_id = ${B} and instrument_key = 'phq9'`;
    expect(rawPhq.value).toBeNull();
    expect(rawPhq.value_enc).not.toBeNull();

    // B shares relationship scores (default) but not mental-health scores.
    const seen = await getPartnerScoresForViewer(A, coupleId);
    expect(seen).toEqual([score("csi16", "total", 60, "non_distressed")]);
    const audits = await sql<Array<{ target_user_id: string; consent_state_at_time: Record<string, unknown>; target_table: string }>>`select target_user_id, consent_state_at_time, target_table from audit_log where actor_user_id = ${A} and action = 'scores.read_partner'`;
    expect(audits).toHaveLength(1);
    expect(audits[0].target_user_id).toBe(B);
    expect(audits[0].target_table).toBe("scores");
    expect(audits[0].consent_state_at_time).toMatchObject({ share_relationship_scores: true, share_mental_health_scores: false });

    await updateConsent(B, coupleId, { share_mental_health_scores: true });
    const withMh = await getPartnerScoresForViewer(A, coupleId);
    expect(withMh).toEqual([score("csi16", "total", 60, "non_distressed"), score("phq9", "total", 4, "minimal")]);

    await updateConsent(B, coupleId, { share_relationship_scores: false });
    expect(await getPartnerScoresForViewer(A, coupleId)).toEqual([score("phq9", "total", 4, "minimal")]);
    const audits2 = await sql<Array<{ n: string }>>`select count(*)::text as n from audit_log where actor_user_id = ${A} and action = 'scores.read_partner'`;
    expect(Number(audits2[0].n)).toBe(3);

    // Own scores are always complete and decrypted; a job read is audited per user.
    expect(await getOwnScores(A, coupleId)).toEqual(stage1.scores.a);
    const forJob = await getScoresForJob(run.id, [A, B], "interpret");
    expect(forJob[A]).toEqual(stage1.scores.a);
    expect(forJob[B]).toEqual(stage1.scores.b);
    const jobAudits = await sql<Array<{ target_user_id: string }>>`select target_user_id from audit_log where actor_kind = 'job' and action = 'interpret.read_scores' and target_id = ${run.id} order by target_user_id`;
    expect(jobAudits.map((r) => r.target_user_id).sort()).toEqual([A, B].sort());
    // An outsider gets nothing.
    expect(await getPartnerScoresForViewer(A2, coupleId)).toEqual([]);
  });

  it("savePlanVersion increments the version and creates revisits for dated active items", async () => {
    const items = [
      { domain: "household" as const, topic: "Dishes", agreed: "Alternate.", a_does: "M", b_does: "T", revisit_date: "2030-01-15", status: "active" as const },
      { domain: "household" as const, topic: "Laundry", agreed: "Weekly.", a_does: "A", b_does: "B", revisit_date: null, status: "active" as const },
      { domain: "household" as const, topic: "Guests", agreed: "Ask.", a_does: "A", b_does: "B", revisit_date: "2030-02-01", status: "parked" as const },
    ];
    const v1 = await savePlanVersion({ coupleId, createdBy: A, items, parentingLines: null });
    expect(v1.version).toBe(1);
    const v2 = await savePlanVersion({ coupleId, createdBy: B, items, parentingLines: null });
    expect(v2.version).toBe(2);
    expect((await getLatestPlan(coupleId))?.id).toBe(v2.id);
    const revisits = await listRevisits(coupleId);
    expect(revisits).toHaveLength(1);
    expect(revisits[0]).toMatchObject({ plan_id: v2.id, couple_id: coupleId, item_index: 0, due_date: "2030-01-15", outcome: null, completed_at: null });
    expect(await getDueRevisits(coupleId, "2030-12-31")).toHaveLength(1);
    expect(await getDueRevisits(coupleId, "2029-12-31")).toHaveLength(0);
    const audits = await sql<Array<{ metadata: { version: number } }>>`select metadata from audit_log where action = 'plan.save' and target_id = ${v2.id}`;
    expect(audits).toEqual([{ metadata: { version: 2 } }]);
  });

  it("createTherapistShare / resolveTherapistShare log each access and revoke invalidates the link", async () => {
    await persistProfile({ userId: A, coupleId, content: { labels: {}, validated_scores: [] } });
    const { share, token } = await createTherapistShare({ userId: A, coupleId, email: "Doc@Example.com" });
    expect(share).toMatchObject({ user_id: A, couple_id: coupleId, email: "doc@example.com", include_brief: false, revoked_at: null, last_accessed_at: null });
    expect(token.length).toBeGreaterThan(30);
    expect((await getProfile(A))?.shared_with).toEqual([expect.objectContaining({ email: "doc@example.com", share_id: share.id, revoked_at: null })]);

    expect(await resolveTherapistShare("not-a-real-token")).toBeNull();
    const resolved = await resolveTherapistShare(token);
    expect(resolved).not.toBeNull();
    expect(resolved?.share.id).toBe(share.id);
    expect(resolved?.profile?.user_id).toBe(A);
    expect(resolved?.briefs).toEqual([]);
    // postgres-js may hand back timestamptz as a string on some servers; the app maps it through Drizzle.
    const [row] = await sql<Array<{ last_accessed_at: Date | string | null }>>`select last_accessed_at from therapist_shares where id = ${share.id}`;
    expect(row.last_accessed_at).not.toBeNull();
    expect(Number.isFinite(new Date(row.last_accessed_at as string).getTime())).toBe(true);
    const audits = await sql<Array<{ actor_kind: string; target_user_id: string; metadata: { email: string }; consent_state_at_time: unknown }>>`select actor_kind, target_user_id, metadata, consent_state_at_time from audit_log where action = 'profile.share_access' and target_id = ${share.id}`;
    expect(audits).toEqual([expect.objectContaining({ actor_kind: "share_link", target_user_id: A, metadata: { email: "doc@example.com" } })]);
    expect(audits[0].consent_state_at_time).toMatchObject({ share_profile_with_therapist: false });

    await revokeTherapistShare({ shareId: share.id, userId: A });
    expect(await resolveTherapistShare(token)).toBeNull();
    const revokeAudit = await sql<Array<{ n: string }>>`select count(*)::text as n from audit_log where action = 'profile.share_revoke' and target_id = ${share.id}`;
    expect(Number(revokeAudit[0].n)).toBe(1);
  });
});
