# The Great Merging

Built from the "The Plan" build prompt; the product name lives in `lib/brand.ts`. A relationship alignment and planning tool for two partners, extensible to a third caregiver and a child. It runs validated psychological instruments, scores them deterministically, uses an LLM only for conversational follow-up and summarization, and produces a written plan the couple writes together. It never produces a verdict about the relationship or a diagnosis of a person.

The design documents live in `docs/` (`the_plan_v2_generic.md`, `app_flow.html`, `question_inventory.md`, `square_one.md`, `instrument_acquisition.md`, `research_brief.md`). The build prompt that this codebase implements is `the-plan-docs/BUILD_PROMPT.md`.

## Stack

Next.js 16 (App Router, TypeScript strict), Supabase (Postgres with row-level security, Auth, Storage), Drizzle ORM over `postgres-js`, Zod, Inngest, `@anthropic-ai/sdk`, Vitest, Playwright, pnpm, Node 20.

## Layout

```
app/                  routes and screens (thin; call lib/)
lib/data/             the only module that reads or writes PHI; every cross-user read is audited
lib/crypto.ts         AES-256-GCM for PHQ-9, GAD-7, OCI-R values and scores
lib/llm.ts            callRole(role, input, schema, ctx); the only file that imports the Anthropic SDK
lib/guardrails.ts     prohibited-language filter plus the model yes/no check
lib/interpretation/   stage 1 (deterministic scoring, couple scores, flags) and stage 2 (interpreter input)
lib/color/            color-layer state machine, concreteness heuristic, module loader
lib/brief, lib/plan, lib/profile, lib/export
instruments/          one module per instrument: definition + pure score(); couple.ts for couple-level metrics
config/instruments/   item text and scoring keys (owner populates text from the official sources)
config/color_modules/ fixed question text per domain (from docs/question_inventory.md Part C)
config/flag_rules.json, config/prohibited_language.json, config/probe_templates.json, config/llm.ts
prompts/              interpreter.v2.md (v1 kept for history), prober.v1.md, summarizer.v1.md, sentiment_flagger.v1.md, concreteness.v1.md, guardrail.v1.md
inngest/              interpretation, prober, brief, export and reminder jobs
db/                   schema.ts, migrations/ (0000 schema, 0001 RLS policies), migrate.ts, seed.ts
evals/                scoring goldens, synthetic couples, interpreter and prober evals
tests/                unit, integration (needs Postgres), e2e (Playwright)
```

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase, Anthropic, Inngest, FIELD_ENCRYPTION_KEY, APP_URL
pnpm db:migrate              # applies db/migrations (schema + RLS) to DATABASE_URL
pnpm db:seed                 # syncs instrument definitions; E2E_SEED=1 adds two test users in one couple
                             # E2E_SEED=1 DEMO_DOCUMENTS=1 also gives them signed lines and writing samples,
                             # so the biographer prototype's avatars and the replay can be tried at once
pnpm dev
```

Generate a field encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. The full account and secrets walkthrough is in [docs/SETUP.md](docs/SETUP.md).

Run Inngest locally with `npx inngest-cli@latest dev` pointed at `http://localhost:3000/api/inngest`.

## Populating the instruments

The repo ships with every item's `text` set to `TODO: populate from source`. Follow `docs/instrument_acquisition.md`: copy the official item text and response anchors into `config/instruments/<key>.json`, confirm the scoring key item by item, then set `scoring_key_verified` to true. `pnpm check:instruments` lists what is still outstanding. The unit test "all instrument item text has been populated from the official sources" is marked as an expected failure until every file is populated.

Instruments whose subscale membership could not be encoded with certainty from memory carry `scoring_key_verified: false` and a `notes` field saying what to verify: SIS/SES-SF, SDI-2, CPQ-SF, Brief CRS, PSDQ-SF, Mini-IPIP, ECR-R. The Who Does What task list is a placeholder pending the official measure.

## Commands

| Command | What it does |
|---|---|
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | ESLint, `tsc --noEmit`, Vitest unit tests |
| `pnpm test:integration:local` | RLS and data-module tests against an embedded Postgres (no install needed); `pnpm test:integration` runs them against `DATABASE_URL` with `RUN_DB_TESTS=1` |
| `pnpm playwright` | end-to-end tests (seeded users, `E2E_SEED=1`) |
| `pnpm evals` | scoring goldens, synthetic couples, interpreter and prober evals (the last two need `ANTHROPIC_API_KEY`) |
| `pnpm db:generate` | regenerate the schema migration from `db/schema.ts` |
| `pnpm cost:report <coupleId>` | LLM cost per couple run from `llm_calls` |
| `pnpm check:instruments` | which instrument files still need text or key verification |

CI (`.github/workflows/ci.yml`) runs lint, typecheck and unit tests on every push; Playwright on pull requests; the LLM evals when files under `prompts/`, `config/llm.ts` or `instruments/` change.

## LLM roles and versions

`config/llm.ts` pins model, temperature, effort, prompt file and output tool per role. Two API constraints are handled in `lib/llm.ts`: Claude Fable 5.1 rejects forced tool choice (the prober uses `tool_choice: auto` with a strict tool and an explicit instruction), and the Claude 5 models reject `temperature` (recorded per role, sent only to Haiku 4.5). Every prompt or model change needs a version bump and a line in `prompts/CHANGELOG.md`.

## Deployment notes

- Vercel for the app, Supabase for data and storage, Inngest Cloud for jobs. HIPAA-grade handling needs the providers' enterprise tiers; no PHI is logged, job payloads carry IDs only, and all PHI reads go through `lib/data`.
- The PDF export job launches Playwright's Chromium; run it on a worker with Chromium available (a self-hosted Inngest worker or a serverless Chromium build), not on a default Vercel function.
- Keep this repository private: the instrument item text you populate is licensed for personal use only.

## Local development caveat

This repository sits in an iCloud-synced folder (`~/Documents`). Under disk pressure macOS evicts files (including `node_modules`, `.git` internals and freshly written source) to iCloud, which corrupts installs and can break git; once it even replaced the working tree with a stale cloud copy. Keep plenty of free disk space, or better, move the repository outside iCloud (for example `~/dev/thegreatmerging`) and push the branch to the remote. If a build or test fails with "Unexpected end of JSON input", "Invalid character" or an empty config file, check for evicted files with `find . -type f -flags +dataless` and reinstall.
