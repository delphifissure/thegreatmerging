# Build prompt: The Plan

You are building a web application called The Plan. It is a relationship alignment and planning tool for two partners, extensible to a third caregiver and a child. It runs validated psychological instruments, scores them deterministically, uses an LLM only for conversational follow-up and summarization, and produces a written plan the couple writes together. It never produces a verdict about the relationship or a diagnosis of a person.

Read this whole document before writing code. Three reference documents accompany it in the repo: `docs/the_plan_v2_generic.md` (the instrument design), `docs/app_flow.html` (the decision tree and full question inventory), and `docs/square_one.md` (a screening questionnaire for a later mode). Where this prompt and those documents conflict, this prompt wins.

---

## 1. Principles that constrain every design decision

1. Scoring is code. Every validated instrument is scored by a pure function with tests, from its official scoring key. The LLM never computes, adjusts, or interprets a score before it has been computed.
2. No person receives a characterization. Individuals are scored on validated instruments, and every score carries its instrument name and source. Nothing derives a label about who someone is (rigid, avoidant, immature, narcissistic, or any other trait word) from any score or answer. Instrument scores, gaps, and domains are the only outputs.
3. Nothing is compared until both partners are done, and each person sees their own results privately before anything is shared.
4. Every free-text field exists because a number asked for it. Scored items have no comment box, only a "needs context" checkbox.
5. Consent is enforced server-side, per data class, and logged. The application layer cannot bypass it.
6. The LLM component is versioned as part of the instrument. Model snapshot, prompt files, temperature, and output schemas are pinned together and changed only by explicit version bump.
7. The interpreter surfaces and asks. The couple decides. No couple-facing screen, prompt, or output may say or imply that the relationship should continue or end, or that the partners are compatible or incompatible. Risk indicators, sentiment flags, and outcome predictions exist only in the gated clinician-and-research layer (section 11a), only after validation, and are never shown to the partners.

---

## 2. Stack (decided; do not substitute)

- **Framework:** Next.js 14+ with the App Router, TypeScript strict mode. One codebase serves the UI and the API (route handlers). No separate backend service in v1.
- **Database, auth, storage:** Supabase. Postgres with row-level security, Supabase Auth for accounts, Supabase Storage for exports. RLS is the authorization layer; policies live in SQL migrations and are tested.
- **ORM and migrations:** Drizzle ORM with the `postgres-js` driver. Schema in `db/schema.ts`; migrations generated with `drizzle-kit` and committed. RLS policies are written as raw SQL in migration files alongside the tables they protect.
- **Validation:** Zod for every request body, every instrument config file, every LLM output, and every job payload.
- **Jobs:** Inngest for durable, retryable, step-based jobs (interpretation runs, LLM calls, exports, reminders). Inngest functions live in `inngest/`. Every LLM call happens inside a job step so retries are automatic and results are memoized per step.
- **LLM:** `@anthropic-ai/sdk`. Roles and models are configured in `config/llm.ts`: `prober` on `claude-fable-5-1` (fallback `claude-opus-5`); `interpreter`, `summarizer`, and `sentiment_flagger` on `claude-sonnet-5` (promote `interpreter` to Fable only if the synthetic-couple evals show misses); `guardrail` and `concreteness` on `claude-haiku-4-5-20251001`. There is no LLM `administrator` role: the color layer is form-driven (section 6). Pin the dated snapshot ID for each role (verify the current IDs in the Anthropic model docs at build time and record them in `config/llm.ts`; never use an alias that auto-updates). Temperature 0 for every role except `summarizer` (0.3). Structured output is enforced by defining a tool whose `input_schema` is the output schema and forcing it with `tool_choice: { type: "tool", name }`, then validating the tool input with the matching Zod schema. Any call that fails validation is retried once with the validation error appended, then raised.
- **LLM cost controls (required, not optional):** (1) Every prompt puts all static content first (system prompt, reading rules, flag rules, probe templates) with a prompt-cache breakpoint after it, and dynamic content last; check current caching mechanics in the Anthropic docs when wiring. (2) Non-interactive work (interpretation, summaries, sentiment flagging, evals) runs through the batch API. (3) Prompts carry item IDs and short descriptors, never instrument item text. (4) Per-person calls never include the other partner's material. (5) Interpretation and summarization are memoized by input hash; a rerun with identical inputs makes no call. (6) The guardrail's deterministic filter runs on every output; the guardrail model call runs only on text that reaches a person. (7) `llm_calls` records tokens in and out for every call, and a dashboard query totals cost per couple run.
- **Encryption:** application-level AES-256-GCM in `lib/crypto.ts` for PHQ-9, GAD-7, and OCI-R response values and score values, with the key supplied from the platform secret store (`FIELD_ENCRYPTION_KEY`). Encrypted columns are `bytea`. Postgres-level encryption at rest is enabled on the Supabase project in addition.
- **Hosting:** Vercel for the Next.js app; Supabase for data; Inngest cloud for jobs. Note for the owner: HIPAA-grade handling (BAAs from Vercel, Supabase, Inngest, and the model provider) requires their enterprise or HIPAA tiers. Build so that the switch is a configuration change, not a rewrite: no PHI in logs, no PHI in job payloads beyond IDs, all PHI reads through one data-access module.
- **Testing:** Vitest for unit and integration tests; Playwright for end-to-end; a separate `evals/` runner (section 10). GitHub Actions runs unit and integration tests on every push, Playwright on pull requests, and the LLM evals only when files under `prompts/`, `config/llm.ts`, or `instruments/` change.
- **Exports:** Markdown generated server-side; PDF rendered from the same HTML in an Inngest job using Playwright's Chromium, stored in Supabase Storage, served via short-lived signed URLs.
- **Package manager:** pnpm. Node 20 LTS.

## 2a. Implementation specifics

### Repository layout

```
/app                      Next.js App Router routes and pages
  /(auth)                 sign in, invitation acceptance
  /setup                  consent, roles, scheduling
  /instruments/[key]      instrument screens
  /results                private results, individual profile
  /color/[domain]         color-layer chat
  /brief, /plan, /revisit
  /api/...                route handlers (thin; call lib/)
/lib
  /data                   the only module that reads or writes PHI; every access logged
  /crypto.ts              AES-256-GCM helpers
  /llm.ts                 callRole(role, input, schema) wrapper
  /guardrails.ts          prohibited-language filter and the LLM yes/no check
/instruments              one module per instrument: definition loader + score()
/config
  /instruments/*.json     item text and scoring keys, populated by the owner
  /color_modules/*.json   color-layer questions per domain
  /flag_rules.json        thresholds and weights
  /llm.ts                 role → model snapshot, temperature, prompt version
/prompts                  interpreter.v1.md, prober.v1.md, summarizer.v1.md, sentiment_flagger.v1.md, concreteness.v1.md, guardrail.v1.md
/inngest                  job functions
/db                       schema.ts, migrations/
/evals                    scoring/, synthetic_couples/, interpreter/, prober/
/tests                    unit, integration, e2e
/docs                     the three reference documents
```

### Scaffold

```
pnpm create next-app@latest the-plan --typescript --app --eslint --tailwind
cd the-plan
pnpm add @supabase/supabase-js @supabase/ssr drizzle-orm postgres zod @anthropic-ai/sdk inngest
pnpm add -D drizzle-kit vitest @playwright/test tsx
```

Create `.env.example` with every variable and commit it. Required variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `DATABASE_URL`, `ANTHROPIC_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `FIELD_ENCRYPTION_KEY` (32 bytes, base64), `APP_URL`.

### Instrument config format

Every file in `config/instruments/` matches this Zod schema (define it in `instruments/schema.ts`):

```
{
  "key": "csi16",
  "name": "Couples Satisfaction Index (16)",
  "source_citation": "Funk & Rogge 2007, Journal of Family Psychology",
  "license_note": "Free for clinical and research use; see source.",
  "layer": 1,
  "passes": ["single"],                 // or ["self","partner_wants"], or ["now","ideal"]
  "items": [
    { "item_id": "csi16_1", "text": "…", "scale": { "min": 0, "max": 6, "labels": ["…"] }, "reverse_scored": false }
  ],
  "scoring": {
    "subscales": [ { "name": "total", "items": ["csi16_1", "…"], "method": "sum" } ],
    "cutoffs": [ { "subscale": "total", "below": 51.5, "label": "distressed" }, { "subscale": "total", "at_or_above": 51.5, "label": "non_distressed" } ]
  }
}
```

`method` is one of `sum`, `mean`, `sum_reverse_aware`, `mean_reverse_aware`. Reverse scoring uses `scale.min + scale.max - value`. The loader refuses any file where `license_note` is empty or `items` is empty, and refuses to start the app if any instrument named in `config/flag_rules.json` fails to load. The owner fills in `text` from the official sources; ship the repo with `text` fields set to `"TODO: populate from source"` and a test that fails while any remain.

### Scoring function contract

Every instrument module exports:

```
export function score(responses: Response[]): Score[]
// Response = { item_id, value, pass }
// Score = { instrument_key, subscale, value, cutoff_label, scoring_version }
```

Pure, synchronous, no I/O. Couple-level computations live in `instruments/couple.ts` and take both partners' Score[] and Response[]: ACQ perceptual accuracy, Who Does What disagreement, CPQ demand-withdraw directions, MAP high-intensity-low-efficacy areas, PSDQ between-parent gaps, polarization gaps and loops.

### Row-level security patterns

Write these as SQL in migrations. Examples to follow for every table:

```
-- responses: only the owner reads or writes
create policy responses_owner on responses
  for all using (user_id = auth.uid());

-- scores: owner always; partner only for relationship instruments, and only if owner consented
create policy scores_owner on scores for select using (user_id = auth.uid());
create policy scores_partner on scores for select using (
  exists (
    select 1 from couples c
    join consent_settings cs on cs.user_id = scores.user_id and cs.couple_id = c.id
    where c.id = scores.couple_id
      and (c.partner_a_id = auth.uid() or c.partner_b_id = auth.uid())
      and scores.user_id <> auth.uid()
      and cs.share_relationship_scores = true
      and scores.instrument_key not in ('phq9','gad7','oci_r')
  )
);
create policy scores_partner_mh on scores for select using (
  exists (
    select 1 from couples c
    join consent_settings cs on cs.user_id = scores.user_id and cs.couple_id = c.id
    where c.id = scores.couple_id
      and (c.partner_a_id = auth.uid() or c.partner_b_id = auth.uid())
      and scores.user_id <> auth.uid()
      and cs.share_mental_health_scores = true
      and scores.instrument_key in ('phq9','gad7','oci_r')
  )
);
```

Server-side code that runs as the service role (jobs) bypasses RLS by design; that code must go through `lib/data` and log every cross-user read to `audit_log` itself. Write a test that asserts every function in `lib/data` that reads another user's rows writes an audit row.

### The LLM wrapper

`lib/llm.ts` exports one function:

```
callRole<T>(role: Role, input: unknown, schema: z.ZodType<T>, ctx: { coupleId, userId?, jobStep }): Promise<T>
```

It reads the role's model snapshot, temperature, and prompt file from `config/llm.ts`; renders the prompt; makes the call with the forced tool; parses the tool input with `schema`; runs `guardrails.check(text)` on every string field of the output; writes an `llm_calls` row with the prompt version and token counts; on validation or guardrail failure, retries once with the error appended to the user turn, then throws. Nothing else in the codebase calls the Anthropic SDK directly. Add a test that fails if any file outside `lib/llm.ts` imports `@anthropic-ai/sdk`.

### Guardrails

`lib/guardrails.ts` has two checks and both must pass: a deterministic pattern list (verdict phrases about the relationship, diagnostic terms, trait labels applied to a person) maintained in `config/prohibited_language.json`, and an LLM yes/no call via `callRole('guardrail', …)` on `claude-sonnet-5` with the schema `{ contains_verdict_or_diagnosis: boolean, reason: string }`. Keep the pattern list under version control and add every miss the evals catch.

### Interpretation job

`inngest/interpret.ts`: triggered by an event `couple/layers.completed` emitted when the second partner finishes Layer 1. Steps: `load` (both partners' responses via `lib/data`, mental-health values decrypted only inside this step and never placed in the job payload), `score` (pure functions), `couple_scores`, `flags` (from `config/flag_rules.json`), `interpret` (one `callRole('interpreter', …)` per couple with mental-health values masked unless consented), `persist`, `notify`. Each step is idempotent; the job is safe to rerun.

### Color-layer state machine

Hand-rolled reducer in `lib/color/machine.ts`, states: `specifics | preference | tag | polarization | perception_gap | context | consistency | complete`, with the per-state question queue derived from the domain's config and the user's flags. State and queue are persisted in `color_sessions` after every turn. No model presents questions; the UI renders fixed text from config. The concreteness check runs after specifics and preference answers (heuristic first, Haiku only if unsure). The prober is invoked once, on entry to `consistency`, via an Inngest step, and its probes are appended to the queue. Skip is a first-class action that records `skipped: true` and advances.

### PHQ-9 item 9

Enforce in `lib/data.writeResponse`: if `instrument_key === 'phq9' && item_id === 'phq9_9' && value > 0`, immediately return a flag to the client to show the safety-resource screen, write a `profiles` note visible only to that user, and never include item 9 in any couple-level computation (assert this in `instruments/couple.ts` tests).

### CI

`.github/workflows/ci.yml`: on push, `pnpm lint && pnpm typecheck && pnpm vitest run`; on pull request, add `pnpm playwright test`; on changes to `prompts/**`, `config/llm.ts`, or `instruments/**`, add `pnpm evals` with `ANTHROPIC_API_KEY` from repository secrets. `pnpm evals` fails if any synthetic couple's flags differ from expected, any interpreter output fails guardrails or schema, any prober run misses a planted contradiction or invents one, or any output references polarization without the unvalidated label.

### Definition of done per phase

A phase is done when: its tests pass in CI; `pnpm dev` demonstrates the phase's screens end to end with two seeded test users; every new table has RLS policies and a test that a partner cannot read what consent forbids; and every new LLM role has a prompt file, a schema, a guardrail test, and an eval fixture. Do not begin the next phase with any of these missing.

## 3. Data model

Tables, with the essential columns. Add timestamps and soft-delete everywhere.

- `users`: id, auth_provider_id, display_name, role (partner | caregiver | child_proxy), created_at.
- `couples`: id, partner_a_id, partner_b_id, status (invited | active | closed), created_at.
- `consent_settings`: user_id, couple_id, share_relationship_scores (bool, default true), share_mental_health_scores (bool, default false), share_written_answers_verbatim (bool, default false), allow_interpreter_to_quote_prior_answers (bool, default true), share_profile_with_therapist (bool, default false), therapist_email (nullable), updated_at. Changes are logged.
- `instrument_definitions`: id, key (e.g. `csi16`), name, source_citation, license_note, layer (0 | 1), items (jsonb array of {item_id, text, scale, reverse_scored}), scoring_spec (jsonb), cutoffs (jsonb), version. Item text is loaded from `config/instruments/*.json`, which the project owner populates from the official sources. Do not hardcode item text from memory. Every instrument file carries a `license_note` and the app refuses to load an instrument whose license_note is empty.
- `responses`: id, user_id, couple_id, instrument_key, item_id, value, needs_context (bool), pass (for two-pass instruments: `self` | `partner_wants` for ACQ; `now` | `ideal` for Who Does What), created_at.
- `scores`: id, user_id, couple_id, instrument_key, subscale, value, cutoff_label (e.g. `distressed`, `non_distressed`, `high`, `moderate`), computed_at, scoring_version.
- `couple_scores`: id, couple_id, metric (e.g. `acq_perceptual_accuracy_a_about_b`, `wdw_now_disagreement`, `polarization_loop`), value, details (jsonb), computed_at.
- `flags`: id, couple_id, domain, rule_key, triggered_by (jsonb: instrument, item, values), weight, created_at.
- `polarization_responses`: user_id, couple_id, dimension, self_alone, self_with_partner, partner_becomes (mirror rating), attribution_text (nullable).
- `color_sessions`: id, user_id, couple_id, domain, status (open | complete), transcript (jsonb array of turns with role, content, step), created_at, completed_at.
- `color_answers`: id, session_id, step (specifics | preference | tag | polarization | perception_gap | context | probe), item_ref (nullable), question_text, answer_text, skipped (bool), shareable_verbatim (bool, default false).
- `tags`: id, user_id, couple_id, domain, item_ref, tag (requirement | preference), comment (required, non-empty).
- `briefs`: id, couple_id, domain, content (jsonb per the brief schema), interpreter_version, created_at.
- `plans`: id, couple_id, version, items (jsonb array of {domain, topic, agreed, a_does, b_does, revisit_date, status (active | parked | closed)}), created_at.
- `revisits`: id, plan_id, item_index, due_date, outcome (still_true | changed | removed), notes, completed_at.
- `profiles`: user_id, content (jsonb), generated_at, shared_with (jsonb array of {email, shared_at, revoked_at}).
- `audit_log`: id, actor_user_id, action, target_user_id, target_table, target_id, consent_state_at_time (jsonb), created_at. Every read of one partner's data by another partner or by an export is logged.
- `llm_calls`: id, couple_id, user_id (nullable), role (interpreter | summarizer | prober | concreteness | guardrail | sentiment_flagger), model, prompt_version, input_hash, cache_read_tokens, tokens_in, tokens_out, created_at.

Row-level security: a user can read their own rows always; can read a partner's `scores` rows only where the partner's `consent_settings` permit that data class; can never read a partner's `responses` for mental-health instruments; can read `briefs` and `plans` for their couple; can read `color_answers` of a partner only where `shareable_verbatim` is true. Caregiver and child-proxy roles have their own narrower policies.

---

## 4. Instruments

Implement each as a module: `instruments/<key>.ts` exporting `definition` (loaded from config) and `score(responses): Score[]`. Each module has a test file with at least: a full-scale response producing the max score, a minimum, a known-value case from the published scoring documentation, and a reverse-scored item check where applicable.

Layer 0 (individual):
- `mini_ipip`: 20 items, five subscales, reverse-scored items per the IPIP key.
- `ecr_r`: 36 items, 1 to 7, two subscales (anxiety, avoidance) as means of 18 items each, reverse-scoring per Fraley's key. Cutoff labels: below 2.5 low, 2.5 to 4.5 moderate, above 4.5 high (configurable).
- `phq9`: 9 items, 0 to 3, total 0 to 27, labels at 5/10/15/20. Item 9 is a safety item: if it scores above 0, the app displays a plain safety resource message to that user immediately, does not mention it to the partner, and flags the profile for the user's own attention only.
- `gad7`: 7 items, total 0 to 21, labels at 5/10/15.
- `sis_ses_sf`: 14 items, three subscales (SES, SIS1, SIS2) per Carpenter et al. 2008.
- `sdi2`: 14 items, dyadic and solitary subscales per Spector et al. 1996.
- `oci_r` (optional): 18 items, total with cutoff 21, six subscales.

Layer 1 (relationship):
- `csi16`: 16 items, mixed scales, total 0 to 81, cutoff 51.5.
- `rdas`: 14 items, three subscales (consensus, satisfaction, cohesion), total 0 to 69, cutoff 48.
- `cpq_sf`: 11 items, subscales per Futris et al. 2010 (a-demand/b-withdraw, b-demand/a-withdraw, constructive communication). Couple-level: compute both demand-withdraw directions.
- `acq`: 34 items, two passes. Per person: desired change vector (−3 to +3). Couple-level: perceptual accuracy for A = agreement between A's `partner_wants` pass and B's actual `self` pass, item by item; report items where the miss is 2 or more.
- `fapbi`: per behavior, frequency and acceptability. Flag any behavior rated unacceptable at current frequency.
- `who_does_what`: per task, `now` and `ideal`, 1 to 9. Per person: now-versus-ideal gap. Couple-level: disagreement between the two `now` ratings.
- `brief_crs`: 14 items, seven subscales per Feinberg et al. 2012.
- `map`: 10 areas, intensity and efficacy per area. Couple-level: areas where either partner's intensity is high and efficacy is low.
- `psdq_sf`: 32 items, three styles (authoritative, authoritarian, permissive) per Robinson et al. 2001. Couple-level: between-parent gap per style.
- `prqc` (optional): 18 items, six subscales.
- `polarization` (original, unvalidated): 10 dimensions, 1 to 7, self_alone and self_with_partner, plus a 10-item mirror (partner_becomes). Per person: gap = self_with_partner − self_alone. Couple-level: a loop on a dimension when A's gap and B's gap have opposite signs and both are 2 or more in magnitude. Label this instrument `unvalidated: true` in its definition and in every output that references it.

Present instruments in this order in the UI: Layer 0 in the order listed; Layer 1 in the order listed. Each instrument on its own screen sequence with a progress bar and save-and-return. Two-pass instruments show both passes for an item on the same screen.

---

## 5. Interpretation

Runs as a job when both partners' Layer 0 and Layer 1 are complete. Two stages.

Stage 1, deterministic (no LLM):
- Compute all scores and couple scores.
- Apply the flag rules, producing `flags` rows with weight:
  - MAP: intensity high (configurable threshold) and efficacy low → weight 3.
  - ACQ: desired change of +2 or beyond on any item → weight 2; perceptual miss of 2 or more → weight 2.
  - FAPBI: any behavior unacceptable at current frequency → weight 2.
  - Who Does What: now-versus-ideal gap of 3 or more for either person, or `now` ratings differing by 3 or more → weight 2.
  - RDAS consensus item at "frequently disagree" or worse by either person → weight 2.
  - Brief CRS: undermining or exposure-to-conflict above midpoint by either person → weight 3.
  - PSDQ: between-parent gap of 1.0 or more (on the 1 to 5 scale) on authoritarian or permissive → weight 3, labeled `values_conflict`.
  - Polarization: any loop → weight 2, labeled `shared_pattern`.
  - Any item marked needs_context → weight 1, routed to the color layer as a context question.
- Map flags to domains: parenting, intimacy, communication, conflict, household, self_care, social_family_longterm. Sum weights per domain. Domains with any flag open the color layer, ordered by summed weight.
- Compute a `distress_context` boolean per couple: true if either partner's PHQ-9 or GAD-7 is 10 or above. This boolean is passed to the interpreter; the underlying numbers are not, unless that person's consent permits.

Stage 2, LLM interpreter (structured output):
- Input: scores with cutoff labels (mental-health scores masked unless consented), couple scores, flags by domain, `distress_context`, `unvalidated` markers.
- Output schema: per domain → `aligned` (array of {item, one_sentence}), `low_intensity_misaligned` (array), `flagged` (array of {item, plain_reason, weight}); plus `private_summaries` per user (one plain sentence per instrument, with the cutoff named).
- Prompt file: `prompts/interpreter.v1.md`. Rules in the prompt, verbatim: report scores against published cutoffs in one plain sentence each; never diagnose or characterize a person; if distress_context is true, say once that relationship scores are read under distress; attachment, sexual-response, and parenting-style scores are context that explains patterns, never verdicts; report aligned items by name; label every reference to the polarization block as unvalidated; plain language; no clinical terms beyond instrument names.
- The output is validated against the schema. Any output containing prohibited verdict language (section 10) is rejected and the job retried once with the rejection reason appended; if it fails again, the job errors and a human is notified.

---

## 6. The color layer (form-driven, with the model at decision points)

One session per user per flagged domain, run privately and asynchronously. A state machine with these steps, in order: `specifics` → `preference` → `tag` → `polarization` (if a gap of 2 or more exists in this domain) → `perception_gap` (for each item with a gap of 2 or more) → `context` (for each needs_context item routed here) → `consistency` (up to three probes) → `complete`.

The questions are fixed text loaded from `config/color_modules/<domain>.json`, using the exact wording in `docs/question_inventory.md` Part C. The UI renders them as a chat-styled form: one question at a time, a text box, the step name at the top ("Specifics, 2 of 3"). No model call is made to present a question, acknowledge an answer, or transition between steps; those are canned strings in the config.

The model is called at exactly three points:

1. **Concreteness** (after each specifics or preference answer). First a deterministic heuristic in `lib/color/concreteness.ts`: an answer passes if it is at least a configurable length and contains at least one marker of a specific situation (a time reference, a named person or role, a past-tense narrative verb, or the words "when," "last," "once," "for example"). Only if the heuristic is unsure (between the pass and fail thresholds) call `callRole('concreteness', …)` on Haiku with the schema `{ concrete: boolean }`. If the answer is not concrete, show the canned follow-up "Can you give me a specific example?" once, store the second answer, and advance regardless.
2. **Probing** (once, on entry to `consistency`). `callRole('prober', …)` on Fable with this user's full answer set for the domain, this user's own scores (including mental-health scores, since they are the user's own), and the user's other color answers. Output schema: up to three probes, each `{question_text, reason_text, references[]}`, using only the seven templates in `docs/question_inventory.md` Part D. Each probe renders with a Skip button; skips are stored with `skipped: true` and never re-asked. The prober is instructed to watch for the three parenting-specific contradictions listed in the inventory.
3. **Guardrail** (on probe text only, since that is the only model-written text in this layer that reaches a person).

The `tag` step requires a non-empty comment; the UI blocks advancing without one. The `perception_gap`, `context`, and `polarization` steps are pure forms with the numbers substituted into the fixed question text.

Every turn is stored in `color_sessions.transcript`. Every model call is logged in `llm_calls`. A user can pause and resume at any step. A domain shows as complete only when the state machine reaches `complete`.

Expected model calls per person per flagged domain: zero to a handful for concreteness, one for probing, one to three for guardrail. Expected calls per couple run, all roles: on the order of thirty, most of them on Haiku.

## 7. Brief and plan

Brief (generated by the summarizer role when both partners have completed all flagged domains):
- Per flagged domain, a JSON object: `what_each_would_do` (summaries per partner), `values_underneath` (summaries per partner), `tags_side_by_side` (array of {item_ref, a_tag, a_comment, b_tag, b_comment}), `perception_gaps` (array with both explanations), `polarization_loops` (if any, framed as a shared pattern), `consistency_notes` (only those the author consented to share), `aligned_items` (by name), `parked_items`.
- Written answers appear in the interpreter's own words unless `shareable_verbatim` is true for that answer.
- The brief screen shows aligned items first, then parked, then the flagged domains in weight order.

Plan (built by the couple, together, in the UI):
- One domain per sitting. For each agenda item: topic, what we agreed, what A does, what B does, revisit date, status.
- Items tagged `requirement` by both partners are pinned at the top and cannot be given a revisit date (they're settled).
- Items where one tagged `requirement` and the other `preference` cannot be saved without a revisit date. The domain cannot be closed while any such item lacks a date.
- Parked items carry over marked `parked`.
- For the parenting domain, the UI prompts for five named lines before the domain can close: children questioning adults; who corrects and how; structure versus freedom for this child at this age; the language and modeling standard adults hold; the protocol for adults disagreeing in front of the child.
- Plans are versioned. Every save creates a new version; the UI shows a diff against the previous.
- Export: a one-page PDF and a Markdown file, with instrument scores labeled by source and all derived content labeled "generated by the interpreter; not validated."

---

## 8. Individual profile and therapist sharing

- After interpretation, generate a profile per user: Layer 0 scores with plain-language summaries, the user's own CSI-16 and RDAS, PSDQ profile if applicable, and the user's own tags. No partner data.
- The profile is owned by the user. Sharing with a therapist is an explicit action: enter an email, confirm, and a time-limited signed link is sent. Every access via that link is logged. The user can revoke at any time.
- The profile document carries two labels at the top: which items are validated instrument scores (with citations) and which are generated, unvalidated content.
- If `share_profile_with_therapist` is true, the couple's brief can also be shared, but only if both partners have enabled it; otherwise the share includes the individual profile alone.

---

## 9. UX

Implement the screens in `docs/app_flow.html` section 1 (diagrams A and B, and the plain-text tree in C) exactly. Key behaviors:

- Setup is a joint session on one device or two, with the consent switches shown to each partner separately.
- Waiting states are explicit: "Your partner hasn't finished yet." No partial comparisons.
- Private results are shown to each person alone, one plain sentence per instrument, before any shared screen exists.
- Every scored item has exactly one extra control: the "needs context" checkbox.
- Progress bars per instrument and per layer. Save-and-return on every screen.
- The color layer is a chat-style interface with the current step named at the top ("Specifics, 2 of 3").
- The brief and plan are reading and editing views designed for two people at one screen.
- Accessibility: keyboard-navigable, screen-reader labels on every scale, high-contrast mode.

---

## 10. Guardrails and evaluation

Prohibited output language (reject and retry, then error): any output from any LLM role that states or implies the relationship should end or continue, that the partners are compatible or incompatible, that a person has a disorder or diagnosis, or that characterizes a person's worth. Implement as a rule-based filter over every output plus, for text that reaches a person, a model check on Haiku with a yes/no schema ("does this text contain a verdict about the relationship or a diagnosis of a person?"). Both must pass. Internal structured outputs (flag lists, scores, memoized intermediates) get the rule-based filter only.

PHQ-9 item 9 handling as described in section 4. Never surfaced to the partner. Never used in any couple-level computation.

Eval harness (`evals/`):
- `evals/scoring/`: golden tests for every instrument from published scoring examples.
- `evals/synthetic_couples/`: at least twenty synthetic couples as JSON (both partners' full responses), each with expected flags per domain and expected polarization loops. The interpretation pipeline must reproduce the expected flags exactly.
- `evals/interpreter/`: for each synthetic couple, the interpreter output is checked for schema validity, absence of prohibited language, correct masking of mental-health scores, and presence of the unvalidated label wherever polarization is referenced.
- `evals/prober/`: for a set of synthetic answer sets with planted contradictions, the prober must find the planted contradiction and must use only the allowed templates; for answer sets with no contradictions, it must produce zero probes.
- Run the full eval suite in CI on every change to a prompt file, model config, or scoring module. A prompt or model change that alters any eval result requires a version bump and a changelog entry.

---

## 11. Extended modules (later phases)

- Caregiver module: a third user with role `caregiver`, linked to the couple. Adjusted Brief CRS, a Who Does What column for their tasks, PSDQ if they caregive, and four color questions from `docs/app_flow.html` section 8. Their results appear as a third position in the parenting brief. RLS: a caregiver sees only their own responses and the parenting brief sections the couple explicitly shares.
- Child conversation: never a form. A guided shared-screen script (the questions in section 8) that an adult runs with the child present; answers are typed by the adult, stored under a `child_proxy` role, and the two adult-answered rule questions are pinned to the plan.
- Square One mode: a single-user mode that presents `docs/square_one.md` as a private notebook: the thirty questions, a notes field per question, a "raised an eyebrow" checkbox, and a requirements list the user writes first. No scoring, no LLM, no sharing. It exists so the pattern is written down before attraction votes.

---

## 11a. Clinician and research layer (gated; later phase)

This is where prediction and decision support live. Nothing in it is visible to the partners.

- Roles: `clinician` (linked to a couple or an individual by explicit, revocable consent from each person whose data they see) and `researcher` (sees de-identified data only, under a data-use agreement recorded in the audit log).
- Therapist view: the individual profile and, if both partners consent, the brief and plan, plus a decision-support panel. Every element of the panel carries the label "decision support; the clinician integrates this and decides what to say."
- Sentiment flags: an LLM role (`sentiment_flagger`, structured output, pinned model) scans written color-layer answers for markers drawn from the couples literature, in particular contempt, criticism, defensiveness, stonewalling, and negative sentiment override. Output per partner is a list of {marker, quoted_span (visible to the clinician only), confidence}. No marker is ever shown to the other partner, and no marker is ever converted to a label about the person. Evaluate against a hand-coded set before enabling.
- Risk indicators: disabled until a validation study exists. When enabled, each indicator shows the flag pattern it derives from, the validation cohort, the effect size, and a confidence interval. An indicator with no confidence interval cannot be displayed. Indicators describe resemblance to cohorts that showed decline; they never describe this couple's future.
- Outcome tracking: with consent, the app collects retakes at 12 and 24 months and short self-reported outcome items (still together, satisfaction, sought therapy). This is the data the validation study needs. Store it de-identified for the research role.
- Screener handoff: PHQ-9, GAD-7, and OCI-R scores appear in the therapist view with severity range and the sentence "screener result; clinical evaluation required." The app never emits a diagnostic term.
- Audit: every clinician read is logged with the consent state at the time. Revocation removes access immediately and logs it.

## 12. Phases

Build in this order. Each phase ends with its tests passing and a short demo.

1. Skeleton: auth, users, couples with invitation, consent settings, RLS policies, audit log. Tests for RLS.
2. Instruments: config loader with license enforcement, all Layer 0 and Layer 1 modules with scoring and golden tests, the forms, progress, save-and-return, needs_context.
3. Interpretation stage 1: deterministic scoring job, couple scores, flag rules, distress_context, private results screens, individual profile generation. Synthetic-couple evals pass.
4. Interpretation stage 2: interpreter role with structured output, prohibited-language filter, per-domain lists.
5. Color layer: state machine, form-driven questions from config, concreteness heuristic with Haiku fallback, tag with required comment, polarization and perception-gap steps, context questions, prober role with template enforcement and skip handling, prompt caching and batch wiring. Prober evals pass; a cost report per couple run is produced.
6. Brief and plan: summarizer role, brief screens, plan builder with pinning and date enforcement, parenting five lines, versioning and diff, export.
7. Revisits and retakes: reminders, due-item screens, retake flow with deltas.
8. Extended modules: caregiver, child conversation, Square One mode.
9. Clinician and research layer: roles and consent, therapist view, sentiment flagger with hand-coded eval, outcome tracking, screener handoff. Risk indicators remain disabled until a validation study is complete.
10. Hardening: field-level encryption verification, therapist sharing with signed links and revocation, full audit review, load test of the job queue, accessibility audit.

---

## 13. What not to build

- No matching, ranking, or compatibility scores between the partners as people.
- No advice about whether to stay or leave, in any screen or output.
- No diagnosis, ever, including in the individual profile.
- No use of partner data to personalize the other partner's experience beyond what the brief and plan require.
- No training or fine-tuning on user data.
- No dark patterns around consent: every switch defaults to the more private setting except relationship-score sharing, and every change is one tap and logged.
