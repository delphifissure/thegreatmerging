/**
 * Shared setup for the database integration tests (tests/integration/*.test.ts).
 *
 * The suites run only when RUN_DB_TESTS=1 and DATABASE_URL point at a real Postgres. The
 * database must be empty the first time: db/migrations (schema, RLS, later migrations) are
 * applied through the drizzle migrator, which records what it applied and skips it afterwards.
 * Test files may run in parallel workers, so migration is serialized with an advisory lock and
 * every file cleans up only the rows it created (deleteFixture) instead of truncating.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const DB_TESTS_ENABLED = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
export const SKIP_MESSAGE = "(skipped: set RUN_DB_TESTS=1 and DATABASE_URL to an empty test database; see the file header for how to run)";
export const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
/** Non-superuser, nologin role the RLS tests switch to with `set local role`. */
export const APP_ROLE = "app_user";
const MIGRATION_LOCK = 20260915;

export type Sql = ReturnType<typeof postgres>;
export type Tx = postgres.TransactionSql;

/** One dedicated connection (so session-level statements such as advisory locks behave). */
export function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 1, prepare: false, onnotice: () => {} });
}

/** Apply db/migrations (idempotent, serialized) and make sure the app_user role exists with table access. */
export async function prepareDatabase(sql: Sql): Promise<void> {
  await sql`select pg_advisory_lock(${MIGRATION_LOCK})`;
  try {
    await migrate(drizzle(sql), { migrationsFolder: path.join(REPO_ROOT, "db", "migrations") });
    await sql.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then create role ${APP_ROLE} nologin; end if; end $$`);
    await sql.unsafe(`grant usage on schema public, app, auth to ${APP_ROLE}`);
    await sql.unsafe(`grant select, insert, update, delete on all tables in schema public to ${APP_ROLE}`);
    // `set role` needs membership unless the connecting role is a superuser.
    const [me] = await sql<Array<{ name: string; super: boolean }>>`select current_user as name, rolsuper as super from pg_roles where rolname = current_user`;
    if (!me.super) await sql.unsafe(`grant ${APP_ROLE} to "${me.name.replace(/"/g, '""')}"`);
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK})`;
  }
}

/**
 * Run `fn` inside a transaction as app_user with auth.uid() = userId (null for an anonymous
 * session). `set local` scopes both to the transaction; `reset role` runs regardless.
 */
export async function runAs<T>(sql: Sql, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${APP_ROLE}`);
    if (userId) await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    try {
      return await fn(tx);
    } finally {
      await tx.unsafe("reset role");
    }
  });
  return result as T;
}

/** Delete everything the fixture created, children first, scoped to these users and couples. */
export async function deleteFixture(sql: Sql, userIds: string[], coupleIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const u = userIds;
  const c = coupleIds.length ? coupleIds : ["00000000-0000-0000-0000-000000000000"];
  await sql`delete from voice_samples where user_id in ${sql(u)}`;
  await sql`delete from document_entries where user_id in ${sql(u)}`;
  await sql`delete from conversation_turns where user_id in ${sql(u)}`;
  await sql`delete from conversation_threads where user_id in ${sql(u)}`;
  await sql`delete from sentiment_flags where couple_id in ${sql(c)} or user_id in ${sql(u)}`;
  await sql`delete from revisits where couple_id in ${sql(c)}`;
  await sql`delete from plans where couple_id in ${sql(c)}`;
  await sql`delete from exports where couple_id in ${sql(c)} or user_id in ${sql(u)} or created_by in ${sql(u)}`;
  await sql`delete from therapist_shares where user_id in ${sql(u)}`;
  await sql`delete from briefs where couple_id in ${sql(c)}`;
  await sql`delete from tags where couple_id in ${sql(c)}`;
  await sql`delete from color_answers where couple_id in ${sql(c)}`;
  await sql`delete from color_sessions where couple_id in ${sql(c)}`;
  await sql`delete from private_results where couple_id in ${sql(c)}`;
  await sql`delete from interpretations where couple_id in ${sql(c)}`;
  await sql`delete from flags where couple_id in ${sql(c)}`;
  await sql`delete from couple_scores where couple_id in ${sql(c)}`;
  await sql`delete from scores where couple_id in ${sql(c)}`;
  await sql`delete from llm_calls where couple_id in ${sql(c)} or user_id in ${sql(u)}`;
  await sql`delete from interpretation_runs where couple_id in ${sql(c)}`;
  await sql`delete from polarization_responses where couple_id in ${sql(c)}`;
  await sql`delete from instrument_completions where couple_id in ${sql(c)}`;
  await sql`delete from responses where couple_id in ${sql(c)}`;
  await sql`delete from consent_changes where couple_id in ${sql(c)}`;
  await sql`delete from consent_settings where couple_id in ${sql(c)}`;
  await sql`delete from invitations where couple_id in ${sql(c)}`;
  await sql`delete from couple_members where couple_id in ${sql(c)}`;
  await sql`delete from child_conversation_answers where couple_id in ${sql(c)}`;
  await sql`delete from caregiver_answers where couple_id in ${sql(c)}`;
  await sql`delete from profiles where user_id in ${sql(u)}`;
  await sql`delete from clinician_links where subject_user_id in ${sql(u)} or clinician_user_id in ${sql(u)}`;
  await sql`delete from square_one_notes where user_id in ${sql(u)}`;
  await sql`delete from square_one_requirements where user_id in ${sql(u)}`;
  await sql`delete from audit_log where actor_user_id in ${sql(u)} or target_user_id in ${sql(u)}`;
  await sql`delete from couples where id in ${sql(c)}`;
  await sql`delete from users where id in ${sql(u)}`;
}
