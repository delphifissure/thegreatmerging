/**
 * Intervention prototype: biographer and avatar conversations, and the personal documents
 * (history and constitution) drafted from them. Everything here belongs to one person and is read
 * only by that person, so every function takes the owner's id and filters on it; nothing crosses
 * a user boundary and there is no partner-facing read. Free text is encrypted at rest.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decryptText, encryptText } from "@/lib/crypto";
import { audit } from "./audit";

export type ThreadKind = "biographer" | "mentor";
export type TurnRole = "guide" | "person" | "avatar";
export type TurnRating = "like_me" | "not_like_me";
export type DocumentKindValue = "history" | "constitution";
export type EntryStatus = "proposed" | "ratified" | "rejected";
export type EntryMark = "settled" | "open";
export type EntryTier = "private" | "avatar_only" | "shareable";

export type TurnExtras = { options: string[]; threads: string[] };
export type Turn = { id: string; seq: number; role: TurnRole; text: string; note: string | null; extras: TurnExtras | null; meta: Record<string, unknown>; rating: TurnRating | null; created_at: Date };
export type DocumentEntry = {
  id: string;
  document: DocumentKindValue;
  section: string;
  text: string;
  status: EntryStatus;
  mark: EntryMark;
  tier: EntryTier;
  in_their_words: boolean;
  source_thread_id: string | null;
  source_turns: number[];
  ratified_at: Date | null;
  created_at: Date;
};

const turnCtx = (userId: string, field: "content" | "note" | "extras") => ({ user_id: userId, instrument_key: "conversation", field });
const entryCtx = (userId: string) => ({ user_id: userId, instrument_key: "document", field: "text" });

// ---------------------------------------------------------------- threads
export async function createThread(input: { userId: string; kind: ThreadKind; focus: string | null }) {
  const rows = await db().insert(schema.conversation_threads).values({ user_id: input.userId, kind: input.kind, focus: input.focus }).returning();
  return rows[0];
}

export async function getOwnThread(threadId: string, userId: string) {
  const rows = await db()
    .select()
    .from(schema.conversation_threads)
    .where(and(eq(schema.conversation_threads.id, threadId), eq(schema.conversation_threads.user_id, userId), isNull(schema.conversation_threads.deleted_at)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listOwnThreads(userId: string, kind: ThreadKind) {
  return db()
    .select()
    .from(schema.conversation_threads)
    .where(and(eq(schema.conversation_threads.user_id, userId), eq(schema.conversation_threads.kind, kind), isNull(schema.conversation_threads.deleted_at)))
    .orderBy(desc(schema.conversation_threads.created_at));
}

export async function setThreadDepth(input: { threadId: string; userId: string; depth: "light" | "deeper" }) {
  await db()
    .update(schema.conversation_threads)
    .set({ depth: input.depth, updated_at: new Date() })
    .where(and(eq(schema.conversation_threads.id, input.threadId), eq(schema.conversation_threads.user_id, input.userId)));
}

export async function closeThread(input: { threadId: string; userId: string; drafted?: boolean }) {
  await db()
    .update(schema.conversation_threads)
    .set({ status: "closed", ...(input.drafted ? { drafted_at: new Date() } : {}), updated_at: new Date() })
    .where(and(eq(schema.conversation_threads.id, input.threadId), eq(schema.conversation_threads.user_id, input.userId)));
}

// ---------------------------------------------------------------- turns
function readExtras(userId: string, enc: Buffer | null): TurnExtras | null {
  if (!enc) return null;
  try {
    const raw = JSON.parse(decryptText(enc, turnCtx(userId, "extras"))) as Partial<TurnExtras>;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { options: strings(raw.options), threads: strings(raw.threads) };
  } catch {
    return null;
  }
}

function toTurn(userId: string, r: typeof schema.conversation_turns.$inferSelect): Turn {
  return {
    id: r.id,
    seq: r.seq,
    role: r.role,
    text: decryptText(r.content_enc, turnCtx(userId, "content")),
    note: r.note_enc ? decryptText(r.note_enc, turnCtx(userId, "note")) : null,
    extras: readExtras(userId, r.extras_enc),
    meta: (r.meta as Record<string, unknown>) ?? {},
    rating: r.rating,
    created_at: r.created_at,
  };
}

/** Append a turn at the next position. The unique (thread, seq) index settles races; one retry. */
export async function appendTurn(input: { threadId: string; userId: string; role: TurnRole; text: string; note?: string | null; extras?: TurnExtras | null; meta?: Record<string, unknown> }): Promise<Turn> {
  const thread = await getOwnThread(input.threadId, input.userId);
  if (!thread) throw new Error("thread not found");
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ next }] = await db()
      .select({ next: sql<number>`coalesce(max(${schema.conversation_turns.seq}), 0) + 1` })
      .from(schema.conversation_turns)
      .where(eq(schema.conversation_turns.thread_id, input.threadId));
    const rows = await db()
      .insert(schema.conversation_turns)
      .values({
        thread_id: input.threadId,
        user_id: input.userId,
        seq: Number(next),
        role: input.role,
        content_enc: encryptText(input.text, turnCtx(input.userId, "content")),
        note_enc: input.note ? encryptText(input.note, turnCtx(input.userId, "note")) : null,
        extras_enc: input.extras ? encryptText(JSON.stringify(input.extras), turnCtx(input.userId, "extras")) : null,
        meta: input.meta ?? {},
      })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) {
      await db().update(schema.conversation_threads).set({ updated_at: new Date() }).where(eq(schema.conversation_threads.id, input.threadId));
      return toTurn(input.userId, rows[0]);
    }
  }
  throw new Error("could not append the turn");
}

export async function listTurns(threadId: string, userId: string): Promise<Turn[]> {
  const rows = await db()
    .select()
    .from(schema.conversation_turns)
    .where(and(eq(schema.conversation_turns.thread_id, threadId), eq(schema.conversation_turns.user_id, userId), isNull(schema.conversation_turns.deleted_at)))
    .orderBy(asc(schema.conversation_turns.seq));
  return rows.map((r) => toTurn(userId, r));
}

export async function rateTurn(input: { turnId: string; userId: string; rating: TurnRating }) {
  await db()
    .update(schema.conversation_turns)
    .set({ rating: input.rating, updated_at: new Date() })
    .where(and(eq(schema.conversation_turns.id, input.turnId), eq(schema.conversation_turns.user_id, input.userId), eq(schema.conversation_turns.role, "avatar")));
}

/**
 * Seeds for the next biographer session, newest first: what the avatar could not answer about its
 * owner, and the thin spots the drafter noticed when a conversation closed.
 */
export async function listOpenQuestions(userId: string, limit = 5): Promise<string[]> {
  const rows = await db()
    .select()
    .from(schema.conversation_turns)
    .where(
      and(
        eq(schema.conversation_turns.user_id, userId),
        isNull(schema.conversation_turns.deleted_at),
        sql`((${schema.conversation_turns.role} = 'avatar' and ${schema.conversation_turns.meta} ->> 'unsure' = 'true') or ${schema.conversation_turns.meta} ->> 'kind' = 'next_time')`,
      ),
    )
    .orderBy(desc(schema.conversation_turns.created_at))
    .limit(limit);
  return rows.flatMap((r) => {
    if (r.role === "avatar") return r.note_enc ? [decryptText(r.note_enc, turnCtx(userId, "note"))] : [];
    return [decryptText(r.content_enc, turnCtx(userId, "content"))];
  });
}

/** Keep the drafter's questions for a later conversation. They are not part of the transcript. */
export async function saveNextTimeQuestions(input: { threadId: string; userId: string; questions: string[] }) {
  for (const q of input.questions.map((x) => x.trim()).filter(Boolean)) {
    await appendTurn({ threadId: input.threadId, userId: input.userId, role: "guide", text: q, meta: { kind: "next_time" } });
  }
}

/** How the person has rated their avatar so far: the self-recognition test. */
export async function avatarRatings(userId: string): Promise<{ like_me: number; not_like_me: number }> {
  const rows = await db()
    .select({ rating: schema.conversation_turns.rating, n: sql<number>`count(*)` })
    .from(schema.conversation_turns)
    .where(and(eq(schema.conversation_turns.user_id, userId), eq(schema.conversation_turns.role, "avatar"), isNull(schema.conversation_turns.deleted_at)))
    .groupBy(schema.conversation_turns.rating);
  const out = { like_me: 0, not_like_me: 0 };
  for (const r of rows) if (r.rating) out[r.rating] = Number(r.n);
  return out;
}

export async function recordTextSafetyEvent(input: { userId: string; threadId: string; kind: string }) {
  await audit({ actorUserId: input.userId, action: `safety.text_screen.${input.kind}`, targetUserId: input.userId, targetTable: "conversation_threads", targetId: input.threadId });
}

// ---------------------------------------------------------------- document entries
function toEntry(userId: string, r: typeof schema.document_entries.$inferSelect): DocumentEntry {
  return {
    id: r.id,
    document: r.document,
    section: r.section,
    text: decryptText(r.text_enc, entryCtx(userId)),
    status: r.status,
    mark: r.mark,
    tier: r.tier,
    in_their_words: r.in_their_words,
    source_thread_id: r.source_thread_id,
    source_turns: (r.source_turns as number[]) ?? [],
    ratified_at: r.ratified_at,
    created_at: r.created_at,
  };
}

export async function proposeEntries(input: {
  userId: string;
  threadId: string | null;
  entries: Array<{ document: DocumentKindValue; section: string; text: string; mark: EntryMark; in_their_words: boolean; source_turns: number[] }>;
}): Promise<DocumentEntry[]> {
  if (input.entries.length === 0) return [];
  const rows = await db()
    .insert(schema.document_entries)
    .values(
      input.entries.map((e) => ({
        user_id: input.userId,
        document: e.document,
        section: e.section,
        text_enc: encryptText(e.text, entryCtx(input.userId)),
        mark: e.mark,
        in_their_words: e.in_their_words,
        source_thread_id: input.threadId,
        source_turns: e.source_turns,
      })),
    )
    .returning();
  return rows.map((r) => toEntry(input.userId, r));
}

export async function listOwnEntries(userId: string, filter: { document?: DocumentKindValue; status?: EntryStatus } = {}): Promise<DocumentEntry[]> {
  const rows = await db()
    .select()
    .from(schema.document_entries)
    .where(
      and(
        eq(schema.document_entries.user_id, userId),
        isNull(schema.document_entries.deleted_at),
        ...(filter.document ? [eq(schema.document_entries.document, filter.document)] : []),
        ...(filter.status ? [eq(schema.document_entries.status, filter.status)] : []),
      ),
    )
    .orderBy(asc(schema.document_entries.created_at));
  return rows.map((r) => toEntry(userId, r));
}

/** Ratify a line, optionally with the owner's edit. Nothing becomes part of a document any other way. */
export async function ratifyEntry(input: { entryId: string; userId: string; text?: string; mark?: EntryMark; tier?: EntryTier }) {
  const text = input.text?.trim();
  await db()
    .update(schema.document_entries)
    .set({
      status: "ratified",
      ratified_at: new Date(),
      updated_at: new Date(),
      ...(text ? { text_enc: encryptText(text, entryCtx(input.userId)), in_their_words: true } : {}),
      ...(input.mark ? { mark: input.mark } : {}),
      ...(input.tier ? { tier: input.tier } : {}),
    })
    .where(and(eq(schema.document_entries.id, input.entryId), eq(schema.document_entries.user_id, input.userId)));
}

export async function rejectEntry(input: { entryId: string; userId: string }) {
  await db()
    .update(schema.document_entries)
    .set({ status: "rejected", updated_at: new Date() })
    .where(and(eq(schema.document_entries.id, input.entryId), eq(schema.document_entries.user_id, input.userId)));
}

/** Remove a line from a document. Soft delete, so the record of what was once ratified survives. */
export async function removeEntry(input: { entryId: string; userId: string }) {
  await db()
    .update(schema.document_entries)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(and(eq(schema.document_entries.id, input.entryId), eq(schema.document_entries.user_id, input.userId)));
}

/** A line the owner writes themselves is ratified from the start. */
export async function addOwnEntry(input: { userId: string; document: DocumentKindValue; section: string; text: string; mark: EntryMark }) {
  const rows = await db()
    .insert(schema.document_entries)
    .values({ user_id: input.userId, document: input.document, section: input.section, text_enc: encryptText(input.text.trim(), entryCtx(input.userId)), status: "ratified", ratified_at: new Date(), mark: input.mark, in_their_words: true })
    .returning();
  return toEntry(input.userId, rows[0]);
}
