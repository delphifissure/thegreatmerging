/**
 * Responses and instrument progress. This is the only place response values are written or read.
 *
 * - Mental-health values (PHQ-9, GAD-7, OCI-R) are encrypted here with lib/crypto and stored in
 *   value_enc; the plaintext column stays NULL.
 * - PHQ-9 item 9 (section 2a): a value above 0 immediately returns a safety flag to the client,
 *   writes a profiles note visible only to that user, and is never included in any couple-level
 *   computation (instruments/couple.ts strips mental-health instruments entirely).
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decryptNumber, encryptNumber } from "@/lib/crypto";
import { isComplete, missingResponses, scaleFor } from "@/instruments/define";
import { getInstrument, isMentalHealthKey, requiredInstruments, LAYER0_ORDER, LAYER1_ORDER, type InstrumentKey } from "@/instruments/registry";
import type { Response } from "@/instruments/schema";
import { audit } from "./audit";
import { getCouple } from "./users";

export class ResponseWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponseWriteError";
  }
}

export const SAFETY_RESOURCE_MESSAGE =
  "You answered that you have had thoughts that you would be better off dead or of hurting yourself. If you are in immediate danger, call your local emergency number now. In the US you can call or text 988 (Suicide and Crisis Lifeline) any time. This answer is private: it is not shown to your partner and is not used in any comparison.";

export type WriteResponseInput = {
  userId: string;
  coupleId: string;
  instrumentKey: string;
  itemId: string;
  pass?: string;
  value: number;
  needsContext?: boolean;
};

export async function writeResponse(input: WriteResponseInput): Promise<{ safetyFlag: boolean; safetyMessage?: string }> {
  const mod = getInstrument(input.instrumentKey);
  const def = mod.definition;
  const item = def.items.find((i) => i.item_id === input.itemId);
  if (!item) throw new ResponseWriteError(`unknown item ${input.itemId} for ${input.instrumentKey}`);
  const pass = input.pass ?? def.passes[0];
  if (!def.passes.includes(pass)) throw new ResponseWriteError(`unknown pass ${pass} for ${input.instrumentKey}`);
  const scale = scaleFor(item, pass);
  if (!Number.isInteger(input.value) || input.value < scale.min || input.value > scale.max) {
    throw new ResponseWriteError(`value ${input.value} outside ${scale.min}..${scale.max}`);
  }
  const mental = isMentalHealthKey(input.instrumentKey);
  const row = {
    user_id: input.userId,
    couple_id: input.coupleId,
    instrument_key: input.instrumentKey,
    item_id: input.itemId,
    pass,
    value: mental ? null : input.value,
    value_enc: mental ? encryptNumber(input.value, { user_id: input.userId, instrument_key: input.instrumentKey, field: `${pass}:${input.itemId}` }) : null,
    needs_context: input.needsContext ?? false,
    updated_at: new Date(),
    deleted_at: null,
  };
  await db()
    .insert(schema.responses)
    .values(row)
    .onConflictDoUpdate({
      target: [schema.responses.user_id, schema.responses.couple_id, schema.responses.instrument_key, schema.responses.item_id, schema.responses.pass],
      set: { value: row.value, value_enc: row.value_enc, needs_context: row.needs_context, updated_at: row.updated_at, deleted_at: null },
    });

  // PHQ-9 item 9 safety rule.
  if (input.instrumentKey === "phq9" && input.itemId === "phq9_9" && input.value > 0) {
    await db()
      .insert(schema.profiles)
      .values({ user_id: input.userId, couple_id: input.coupleId, safety_note: SAFETY_RESOURCE_MESSAGE, safety_note_at: new Date() })
      .onConflictDoUpdate({ target: schema.profiles.user_id, set: { safety_note: SAFETY_RESOURCE_MESSAGE, safety_note_at: new Date(), updated_at: new Date() } });
    await audit({ actorUserId: input.userId, action: "safety.phq9_item9", targetUserId: input.userId, targetTable: "profiles", targetId: input.userId });
    return { safetyFlag: true, safetyMessage: SAFETY_RESOURCE_MESSAGE };
  }
  return { safetyFlag: false };
}

function rowToResponse(r: typeof schema.responses.$inferSelect): Response {
  const mental = isMentalHealthKey(r.instrument_key);
  const value = mental
    ? decryptNumber(r.value_enc!, { user_id: r.user_id, instrument_key: r.instrument_key, field: `${r.pass}:${r.item_id}` })
    : r.value!;
  return { item_id: r.item_id, value, pass: r.pass, needs_context: r.needs_context };
}

/** The owner's own responses to one instrument. */
export async function listResponses(userId: string, coupleId: string, instrumentKey: string): Promise<Response[]> {
  const rows = await db()
    .select()
    .from(schema.responses)
    .where(
      and(
        eq(schema.responses.user_id, userId),
        eq(schema.responses.couple_id, coupleId),
        eq(schema.responses.instrument_key, instrumentKey),
        isNull(schema.responses.deleted_at),
      ),
    );
  return rows.map(rowToResponse);
}

/**
 * All of one user's responses, decrypted, for the interpretation job. The job reads this for both
 * partners on the couple's behalf; each read is audited with actor_kind "job".
 */
export async function listAllResponsesForJob(userId: string, coupleId: string, jobName: string): Promise<Record<string, Response[]>> {
  await audit({ actorUserId: null, actorKind: "job", action: `${jobName}.read_responses`, targetUserId: userId, targetTable: "responses", targetId: coupleId });
  const rows = await db()
    .select()
    .from(schema.responses)
    .where(and(eq(schema.responses.user_id, userId), eq(schema.responses.couple_id, coupleId), isNull(schema.responses.deleted_at)));
  const out: Record<string, Response[]> = {};
  for (const r of rows) (out[r.instrument_key] ??= []).push(rowToResponse(r));
  return out;
}

export async function markInstrumentComplete(userId: string, coupleId: string, instrumentKey: string): Promise<void> {
  const def = getInstrument(instrumentKey).definition;
  const responses = await listResponses(userId, coupleId, instrumentKey);
  if (!isComplete(def, responses)) {
    const missing = missingResponses(def, responses);
    throw new ResponseWriteError(`${instrumentKey} is not complete: ${missing.length} item(s) unanswered`);
  }
  await db()
    .insert(schema.instrument_completions)
    .values({ user_id: userId, couple_id: coupleId, instrument_key: instrumentKey })
    .onConflictDoNothing();
}

export type InstrumentProgress = {
  key: InstrumentKey;
  layer: 0 | 1;
  name: string;
  required: boolean;
  optional: boolean;
  total: number;
  answered: number;
  complete: boolean;
};

export async function getProgress(userId: string, coupleId: string): Promise<{ layer0: InstrumentProgress[]; layer1: InstrumentProgress[] }> {
  const couple = await getCouple(coupleId);
  const req = requiredInstruments({ hasChildren: couple?.has_children ?? false });
  const requiredSet = new Set<string>([...req.layer0, ...req.layer1]);
  const rows = await db()
    .select({ instrument_key: schema.responses.instrument_key })
    .from(schema.responses)
    .where(and(eq(schema.responses.user_id, userId), eq(schema.responses.couple_id, coupleId), isNull(schema.responses.deleted_at)));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.instrument_key, (counts.get(r.instrument_key) ?? 0) + 1);
  const done = new Set(
    (
      await db()
        .select({ k: schema.instrument_completions.instrument_key })
        .from(schema.instrument_completions)
        .where(and(eq(schema.instrument_completions.user_id, userId), eq(schema.instrument_completions.couple_id, coupleId)))
    ).map((r) => r.k),
  );
  const build = (keys: readonly InstrumentKey[]): InstrumentProgress[] =>
    keys
      .filter((k) => requiredSet.has(k) || ["oci_r", "prqc"].includes(k))
      .map((k) => {
        const def = getInstrument(k).definition;
        const total = def.items.length * def.passes.length;
        return {
          key: k,
          layer: def.layer,
          name: def.name,
          required: requiredSet.has(k),
          optional: !requiredSet.has(k),
          total,
          answered: counts.get(k) ?? 0,
          complete: done.has(k),
        };
      });
  return { layer0: build(LAYER0_ORDER), layer1: build(LAYER1_ORDER) };
}

/** True when both partners have marked every required instrument complete. */
export async function coupleCompletionStatus(coupleId: string): Promise<{ both: boolean; a: boolean; b: boolean }> {
  const couple = await getCouple(coupleId);
  if (!couple || !couple.partner_b_id) return { both: false, a: false, b: false };
  const req = requiredInstruments({ hasChildren: couple.has_children });
  const needed = [...req.layer0, ...req.layer1];
  const check = async (userId: string) => {
    const rows = await db()
      .select({ k: schema.instrument_completions.instrument_key })
      .from(schema.instrument_completions)
      .where(and(eq(schema.instrument_completions.user_id, userId), eq(schema.instrument_completions.couple_id, coupleId)));
    const done = new Set(rows.map((r) => r.k));
    return needed.every((k) => done.has(k));
  };
  const a = await check(couple.partner_a_id);
  const b = await check(couple.partner_b_id);
  return { both: a && b, a, b };
}

/** The owner's saved polarization attributions, keyed by dimension. */
export async function getPolarizationAttributions(userId: string, coupleId: string): Promise<Record<string, string | null>> {
  const rows = await db()
    .select({ dimension: schema.polarization_responses.dimension, attribution_text: schema.polarization_responses.attribution_text })
    .from(schema.polarization_responses)
    .where(and(eq(schema.polarization_responses.user_id, userId), eq(schema.polarization_responses.couple_id, coupleId), isNull(schema.polarization_responses.deleted_at)));
  return Object.fromEntries(rows.map((r) => [r.dimension, r.attribution_text]));
}

/**
 * Per-layer completion status for both partners, status only (never scores or answers), for the
 * waiting screen. The partner's status is a cross-user read and is audited.
 */
export async function partnerLayerStatus(viewerId: string, coupleId: string): Promise<{ self: { layer0: boolean; layer1: boolean }; partner: { layer0: boolean; layer1: boolean } | null }> {
  const couple = await getCouple(coupleId);
  const empty = { layer0: false, layer1: false };
  if (!couple) return { self: empty, partner: null };
  const req = requiredInstruments({ hasChildren: couple.has_children });
  const status = async (userId: string) => {
    const rows = await db()
      .select({ k: schema.instrument_completions.instrument_key })
      .from(schema.instrument_completions)
      .where(and(eq(schema.instrument_completions.user_id, userId), eq(schema.instrument_completions.couple_id, coupleId)));
    const done = new Set(rows.map((r) => r.k));
    return { layer0: req.layer0.every((k) => done.has(k)), layer1: req.layer1.every((k) => done.has(k)) };
  };
  const self = await status(viewerId);
  const partnerId = couple.partner_a_id === viewerId ? couple.partner_b_id : couple.partner_b_id === viewerId ? couple.partner_a_id : null;
  if (!partnerId) return { self, partner: null };
  await audit({ actorUserId: viewerId, action: "progress.read_partner_status", targetUserId: partnerId, targetTable: "instrument_completions", targetId: coupleId });
  return { self, partner: await status(partnerId) };
}

export async function writePolarizationAttribution(input: { userId: string; coupleId: string; dimension: string; attributionText: string | null }) {
  const rs = await listResponses(input.userId, input.coupleId, "polarization");
  const get = (pass: string) => rs.find((r) => r.item_id === input.dimension && r.pass === pass)?.value;
  const selfAlone = get("self_alone");
  const selfWith = get("self_with_partner");
  const partnerBecomes = get("partner_becomes");
  if (selfAlone === undefined || selfWith === undefined || partnerBecomes === undefined) {
    throw new ResponseWriteError("answer the three ratings for this dimension before adding an attribution");
  }
  await db()
    .insert(schema.polarization_responses)
    .values({
      user_id: input.userId,
      couple_id: input.coupleId,
      dimension: input.dimension,
      self_alone: selfAlone,
      self_with_partner: selfWith,
      partner_becomes: partnerBecomes,
      attribution_text: input.attributionText,
    })
    .onConflictDoUpdate({
      target: [schema.polarization_responses.user_id, schema.polarization_responses.couple_id, schema.polarization_responses.dimension],
      set: { self_alone: selfAlone, self_with_partner: selfWith, partner_becomes: partnerBecomes, attribution_text: input.attributionText, updated_at: new Date() },
    });
}
