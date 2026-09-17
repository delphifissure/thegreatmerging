/**
 * Seed: sync instrument_definitions from config/instruments and, when E2E_SEED=1, create two
 * test users (Ana and Ben) in one active couple with children, plus a Square One user.
 *
 * With SUPABASE_SERVICE_ROLE_KEY set, auth users are created through the Supabase admin API so
 * the seeded accounts can sign in (password from E2E_PASSWORD, default "the-plan-e2e").
 * Without it (plain Postgres), fixed UUIDs are inserted into `users` for integration tests.
 */
import "@/lib/load_env";
import { createClient } from "@supabase/supabase-js";
import { db, schema } from "@/db/client";
import { INSTRUMENTS } from "@/instruments/registry";
import * as data from "@/lib/data";
import { serverRealtimeOptions } from "@/lib/supabase/server_realtime";

export const SEED_USERS = {
  ana: { id: "11111111-1111-4111-8111-111111111111", email: "ana@example.test", name: "Ana" },
  ben: { id: "22222222-2222-4222-8222-222222222222", email: "ben@example.test", name: "Ben" },
  solo: { id: "33333333-3333-4333-8333-333333333333", email: "solo@example.test", name: "Sam" },
} as const;

async function ensureAuthUser(u: { id: string; email: string; name: string }): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return u.id;
  const admin = createClient(url, key, { auth: { persistSession: false }, realtime: serverRealtimeOptions });
  const password = process.env.E2E_PASSWORD ?? "the-plan-e2e";
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((x) => x.email === u.email);
  if (existing) return existing.id;
  const { data: created, error } = await admin.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { display_name: u.name } });
  if (error || !created.user) throw error ?? new Error("could not create auth user");
  return created.user.id;
}

export async function syncInstrumentDefinitions() {
  for (const mod of Object.values(INSTRUMENTS)) {
    const d = mod.definition;
    await db()
      .insert(schema.instrument_definitions)
      .values({
        key: d.key,
        name: d.name,
        source_citation: d.source_citation,
        license_note: d.license_note,
        layer: d.layer,
        unvalidated: d.unvalidated,
        items: d.items,
        scoring_spec: d.scoring.subscales,
        cutoffs: d.scoring.cutoffs,
        version: d.scoring.version,
      })
      .onConflictDoUpdate({
        target: schema.instrument_definitions.key,
        set: { name: d.name, source_citation: d.source_citation, license_note: d.license_note, layer: d.layer, unvalidated: d.unvalidated, items: d.items, scoring_spec: d.scoring.subscales, cutoffs: d.scoring.cutoffs, version: d.scoring.version, updated_at: new Date() },
      });
  }
}

export async function seedE2E() {
  const anaId = await ensureAuthUser(SEED_USERS.ana);
  const benId = await ensureAuthUser(SEED_USERS.ben);
  const soloId = await ensureAuthUser(SEED_USERS.solo);
  await data.ensureUser({ id: anaId, displayName: SEED_USERS.ana.name });
  await data.ensureUser({ id: benId, displayName: SEED_USERS.ben.name });
  await data.ensureUser({ id: soloId, displayName: SEED_USERS.solo.name });
  const existing = await data.getCoupleForUser(anaId);
  if (!existing) {
    const couple = await data.createCouple({ partnerAId: anaId, hasChildren: true });
    const { token } = await data.createInvitation({ coupleId: couple.id, invitedBy: anaId, email: SEED_USERS.ben.email });
    await data.acceptInvitation({ token, userId: benId });
  }
  return { anaId, benId, soloId };
}

async function main() {
  await syncInstrumentDefinitions();
  console.log("instrument definitions synced");
  if (process.env.E2E_SEED === "1") {
    const ids = await seedE2E();
    console.log("seeded test users", ids);
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
