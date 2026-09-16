# Setup: accounts, secrets, and first run

Everything the app needs that a person has to create by hand. Fill `.env.local` (already generated with placeholders and a fresh `FIELD_ENCRYPTION_KEY`) as you go. Never commit `.env.local`.

## 1. Supabase (database, auth, storage)

1. Create a project at supabase.com. Choose a region close to you. Save the database password.
2. Project Settings → API: copy the **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`, the **anon** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the **service_role** key into `SUPABASE_SERVICE_ROLE_KEY` (server only).
3. Project Settings → Database → Connection string → **Transaction** pooler (port 6543): copy into `DATABASE_URL`, replacing `[YOUR-PASSWORD]`.
4. Authentication → Providers: enable **Email** (password sign-in and magic links both work with the sign-in screen). Authentication → URL Configuration: set the Site URL to your `APP_URL` and add `<APP_URL>/auth/callback` to the redirect list.
5. Storage: create a private bucket named `exports` (the export job uploads there and serves 15-minute signed URLs).
6. Apply the schema and policies: `pnpm db:migrate`. Then `pnpm db:seed` (adds the instrument definitions). With `E2E_SEED=1` the seed also creates two test users (Ana and Ben) in one couple with children and a solo Square One user; their password is `E2E_PASSWORD`.
7. Project Settings → Database: confirm encryption at rest is on (it is by default). For HIPAA-grade handling, the HIPAA add-on and a signed BAA are required before real data.

## 2. Anthropic (the interpreter, prober, summarizer, guardrail and concreteness roles)

1. Create an API key at console.anthropic.com and put it in `ANTHROPIC_API_KEY`.
2. Verify the pinned model identifiers still resolve: `pnpm exec tsx scripts/verify_models.ts`.
3. Baseline the LLM evals: `pnpm evals --out evals/results/baseline.json`. Record the result in `prompts/CHANGELOG.md`. Expect on the order of 30 model calls (20 interpreter requests through the Batches API, 7 prober cases, plus guardrail checks); the sentiment suite is separate: `pnpm evals --suite sentiment`.
4. The console's data-retention setting must allow 30-day retention for Claude Fable 5.1 (the prober); zero-data-retention organizations receive a 400 from that model.

## 3. Inngest (jobs)

- Local development: run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` alongside `pnpm dev`. No keys needed.
- Production: create an app at app.inngest.com, copy the **Event key** into `INNGEST_EVENT_KEY` and the **Signing key** into `INNGEST_SIGNING_KEY`, and register `<APP_URL>/api/inngest` as the serve endpoint after the first deploy.
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
