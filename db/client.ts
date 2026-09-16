/**
 * Server-side Drizzle client over postgres-js.
 *
 * This client connects with DATABASE_URL, which on Supabase is the `postgres` role and
 * therefore bypasses row-level security. It must be used only from lib/data (the single
 * PHI access module) and from jobs. Request handlers acting on behalf of a signed-in user
 * go through the Supabase client in lib/supabase, where RLS applies.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __thePlanPg: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!globalThis.__thePlanPg) {
    globalThis.__thePlanPg = postgres(url, { prepare: false, max: 5 });
  }
  return globalThis.__thePlanPg;
}

export type Db = ReturnType<typeof makeDb>;

export function makeDb() {
  return drizzle(getSql(), { schema });
}

let cached: Db | undefined;
export function db(): Db {
  if (!cached) cached = makeDb();
  return cached;
}

export { schema };
