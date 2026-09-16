/**
 * Run the integration tests (RLS and the data module) against an embedded Postgres.
 * No system install: the `embedded-postgres` package downloads platform binaries into node_modules.
 *
 *   pnpm test:integration:local           boot, migrate, run tests, stop
 *   pnpm test:integration:local --keep    leave the server running (prints DATABASE_URL)
 *
 * Data lives under .pg-test/ (gitignored) and is recreated on every run.
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.TEST_PG_PORT ?? 54329);
const DIR = path.join(process.cwd(), ".pg-test");
const DB = "the_plan_test";
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}`;

async function main() {
  fs.rmSync(DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: DIR, user: "postgres", password: "postgres", port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB);
  console.log(`embedded postgres ready: ${URL}`);
  const env = { ...process.env, DATABASE_URL: URL, RUN_DB_TESTS: "1", FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64") };
  const migrate = spawnSync("./node_modules/.bin/tsx", ["--tsconfig", "tsconfig.json", "db/migrate.ts"], { stdio: "inherit", env });
  let code = migrate.status ?? 1;
  if (code === 0) {
    const test = spawnSync("./node_modules/.bin/vitest", ["run", "tests/integration", ...process.argv.slice(2).filter((a) => a !== "--keep")], { stdio: "inherit", env });
    code = test.status ?? 1;
  }
  if (process.argv.includes("--keep")) {
    console.log(`server left running; DATABASE_URL=${URL}. Press Ctrl+C to stop.`);
    await new Promise(() => {});
  }
  await pg.stop();
  process.exit(code);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
