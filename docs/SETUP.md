# Setup: accounts, secrets, and first run

Everything the app needs that a person has to create by hand. Fill `.env.local` (already generated with placeholders and a fresh `FIELD_ENCRYPTION_KEY`) as you go. Never commit `.env.local`.

## 1. Supabase (database, auth, storage)

Free plan is enough for development with test data (checked 2026-09-16): 2 active projects, 500 MB database, 1 GB storage, no backups, and projects pause after a week of inactivity (resume from the dashboard). Real people's data needs the Pro plan ($25/month) plus the HIPAA add-on and a signed BAA.

If `pnpm` is not on your PATH, prefix every `pnpm` command with `corepack` (for example `corepack pnpm db:migrate`); it uses the version pinned in `package.json`.

1. Create a project at supabase.com (New project). Pick a region close to you, set a database password and save it.
2. Settings → API Keys: copy the **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`. Copy the **publishable** key (`sb_publishable_…`, or the legacy `anon` key) into `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Copy a **secret** key (`sb_secret_…`, or the legacy `service_role` key) into `SUPABASE_SERVICE_ROLE_KEY`. The secret key is used only on the server (seed script and export job). Supabase is retiring the legacy keys by the end of 2026, so prefer the new ones.
3. Click **Connect** at the top of the project page and copy the **Transaction pooler** string (port 6543) into `DATABASE_URL`, replacing `[YOUR-PASSWORD]`. The app already disables prepared statements, which this pooler requires. If `pnpm db:migrate` fails through it, run the migration once with the **Session pooler** string (port 5432) instead.
4. Authentication → Sign In / Providers: keep **Email** enabled. Authentication → URL Configuration: set the Site URL to your `APP_URL` (`http://localhost:3000` for now) and add `<APP_URL>/auth/callback` to the redirect URLs. The built-in email sender is rate-limited and meant for testing; configure custom SMTP (Authentication → Emails) before inviting real users.
5. Storage → New bucket: create a **private** bucket named `exports` (the export job uploads there and serves 15-minute signed URLs).
6. Apply the schema and policies: `pnpm db:migrate`. Then `pnpm db:seed` (adds the instrument definitions). With `E2E_SEED=1` the seed also creates two test users (Ana and Ben) in one couple with children and a solo Square One user; their password is `E2E_PASSWORD`.
7. Encryption at rest is on by default. For HIPAA-grade handling, the HIPAA add-on and a signed BAA are required before real data.

## 2. Anthropic (the interpreter, prober, summarizer, guardrail and concreteness roles)

1. Create an API key at console.anthropic.com and put it in `ANTHROPIC_API_KEY`.
2. Verify the pinned model identifiers still resolve: `pnpm exec tsx scripts/verify_models.ts`.
3. Baseline the LLM evals: `pnpm evals --out evals/results/baseline.json`. Record the result in `prompts/CHANGELOG.md`. Expect about 55 model calls and about $1 (20 interpreter requests through the Batches API, which can take from minutes to an hour, 7 prober cases, plus guardrail checks); the sentiment suite is separate: `pnpm evals --suite sentiment`. If the run is interrupted after the batch was submitted, collect it without paying again: `pnpm evals --suite interpreter --interpreter-batch <msgbatch id from the log>`. Add `--dump evals/results/outputs` to keep the raw outputs for review.
4. The console's data-retention setting must allow 30-day retention for Claude Fable 5.1 (the prober); zero-data-retention organizations receive a 400 from that model.

## 3. Inngest (jobs)

No account is needed for local development. The free Hobby plan covers a deployed app with test traffic (checked 2026-09-16): 50,000 executions a month (each function run and each step counts), 5 concurrent steps, 24 hours of logs, no credit card. Paid plans start at $99/month; a BAA for real health data is a paid add-on.

- Local development: keep `INNGEST_DEV=1` in `.env.local` and leave both Inngest keys commented out (the SDK otherwise defaults to Inngest Cloud). Run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` alongside `pnpm dev`, then open http://localhost:8288 to watch jobs. The dev server must be running for interpretation, probes and exports to happen.
- Production: remove `INNGEST_DEV`, sign up at app.inngest.com and stay in the **Production** environment. Manage → Event Keys → **+ Create Event Key**, then copy it into `INNGEST_EVENT_KEY`. Manage → Signing Key, then copy it into `INNGEST_SIGNING_KEY`. After the first deploy, either install Inngest's Vercel integration, which sets both keys and syncs on every deploy, or open Apps → **Sync New App** and paste `<APP_URL>/api/inngest`.
- The PDF export job launches Playwright's Chromium. Run it on a worker with Chromium available (self-hosted Inngest worker or a serverless Chromium build); default Vercel functions cannot.

## 4. Vercel (hosting)

1. Import the GitHub repository. Framework preset: Next.js. Node 20.
2. Add every variable from `.env.local` to the project's environment (production and preview), except `E2E_*` and `RUN_DB_TESTS`.
3. Set `APP_URL` to the deployment URL and update the Supabase redirect list to match.

## 5. GitHub Actions secrets (for CI)

Repository → Settings → Secrets and variables → Actions:

| Secret | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | the LLM evals job (runs only when prompts, `config/llm.ts` or `instruments/` change) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `FIELD_ENCRYPTION_KEY` | the Playwright job on pull requests (a dedicated test project, never production) |

The unit and integration jobs need no secrets: integration tests run against an embedded Postgres (`pnpm test:integration:local`).

## 6. Instruments

`pnpm check:instruments` lists which instrument files still carry placeholder text or an unverified scoring key. Follow `docs/instrument_acquisition.md` and `docs/instrument_sources.md` to obtain and transcribe the remaining ones. Keep the repository private: the item text is licensed for personal use.

## 7. First run

```bash
pnpm install
pnpm db:migrate && E2E_SEED=1 pnpm db:seed
pnpm dev                      # http://localhost:3000
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Sign in as `ana@example.test` / `the-plan-e2e`, complete Layer 0 and Layer 1, then sign in as `ben@example.test` in another browser to finish the couple and trigger interpretation.
