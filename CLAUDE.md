@AGENTS.md

# Project conventions for The Plan

- Read `the-plan-docs/BUILD_PROMPT.md` and `docs/` before changing behaviour. The seven principles in the build prompt (scoring is code; no characterization of a person; nothing compared until both partners are done; free text only where a number asked for it; consent enforced server-side and logged; the LLM component is versioned; the interpreter surfaces and asks, the couple decides) override convenience.
- `lib/data/` is the only module that reads or writes PHI. Never import `db/client` or `db/schema` from `app/` or `inngest/` (except `inngest/reminders.ts`). Every cross-user read goes through `audit()` or `auditedCrossUserRead()`.
- `lib/llm.ts` is the only file that imports `@anthropic-ai/sdk`. Roles, models, temperatures and prompt versions live in `config/llm.ts`; any change needs a bump of `LLM_CONFIG_VERSION` and an entry in `prompts/CHANGELOG.md`.
- Instrument item text is populated by the owner from official sources into `config/instruments/*.json`; never write item text from memory. Scoring keys flagged `scoring_key_verified: false` must be checked against the published source.
- Tooling on this machine: pnpm is not on PATH (see README); use `./node_modules/.bin/vitest`, `./node_modules/.bin/tsx --tsconfig tsconfig.json`, and `NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit`. the repo lives in an iCloud-synced folder; if files read as empty, check `find . -type f -flags +dataless` and see the README caveat.
- Run `pnpm evals --suite scoring` and `--suite synthetic_couples` after touching `instruments/`, `config/flag_rules.json` or `config/instruments/`.
