# Prompt and model changelog

The LLM component is versioned as part of the instrument. Any change to a prompt file, a model identifier, a temperature, an effort setting, or an output schema requires a version bump here and, when it alters any eval result, a note of which evals changed.

## 2026.09.18-1

Intervention prototype (`docs/concept_intervention.md`), behind `BIOGRAPHER_ENABLED=1`. Three new roles, all on `claude-sonnet-5`, interactive and never batched. Existing prompts are unchanged.

- `biographer.v1`: a solo interviewer whose only aim is to understand. One question per turn, an optional short reflection, an honest `why` for every question, and the motivational-interviewing move of placing a stated value beside a described behaviour (`kind: discrepancy`, which must cite both turns). May be warm and may nudge with questions; never advises, labels, diagnoses or gives a verdict.
- `drafter.v1`: proposes first-person lines for a person's history and constitution from one finished conversation. Only what the person said; every line cites the person's own turns, and lines resting on nothing they said are dropped in code. Nothing is part of a document until its owner ratifies it.
- `mentor.v1`: the one-notch-ahead self. Speaks in the first person from ratified lines only, as a coping model rather than a mastery model, cites the lines it drew on, holds settled requirements, and when the lines do not cover something says so and hands a second-person question back to the biographer.
- These roles record usage in `llm_calls` but never write to `llm_memo`, because their outputs echo what a person wrote and that table is not encrypted.
- Output schemas reject tool-call markup leaking into any text a person reads. The first live run produced one avatar reply containing `</reply><parameter name="draws_on">…` with its citations lost; it is now a validation failure that the wrapper retries.

**Eval baseline (2026-09-18):** biographer 4/4 and mentor 4/4 on the live model after the markup guard; the first run was 7/8, the miss being an eval check that read a refusal ("I can't tell you what you should do") as advice. About five cents per suite. Dry run now writes 40 requests.

## 2026.09.16-2

- `interpreter.v2` replaces `interpreter.v1` (kept for history). The v1 wording asked for a private-summary sentence for masked mental-health scores, and Claude Sonnet 5 answered with placeholders such as "Your depression symptom score is masked and not shown here." v2 tells the model to write no PHQ-9, GAD-7 or OCI-R sentence at all (code writes them in `privateResultsFor`, which already discarded model sentences, so nothing reached a person), never to say a score is masked or withheld, and to leave `flagged` empty in a domain without flags.
- The interpreter output is now validated against `interpreterOutputSchemaFor(input)`: flagged entries must mirror the code-produced flags (no entries in an unflagged domain, no more entries than flags, weights copied unchanged). In the first batch the model invented two flagged items with weight 0 for a couple with no flags. The JSON schema sent to the model is unchanged.
- Eval harness: the interpreter checks moved to `evals/interpreter_checks.ts`. The masked-number check no longer reads the digits in "PHQ-9" or "GAD-7" as scores, and no longer counts a consenting partner's own value that equals the masked one. A consenting user's model-written mental-health sentence is a warning, not a failure, because code discards it. Transient network errors are retried; `--interpreter-batch <id>` collects an already-submitted batch; `--dump <dir>` keeps raw outputs.
- Two prober fixtures meant to be clean contained a real small tension and were revised (see `notes` on `communication_clean` and `conflict_clean_with_skips`). The prober prompt is unchanged.

**Eval baseline (first live run, 2026-09-16):**

| Suite | Result |
| --- | --- |
| scoring goldens | 50/50 |
| synthetic couples (stage 1) | 20/20 |
| interpreter, 20 couples, Batches API | 20/20; one output needed a guardrail retry; couple_01 carried the OCI-R warning above |
| prober, 7 cases | seven runs: five at 7/7; the first probed `communication_clean` and the fifth probed `conflict_clean_with_skips`, each before that fixture was revised; the two runs after both revisions were 7/7 |
| sentiment flagger, 5 cases (`--suite sentiment`) | 5/5, run under 2026.09.16-1; the sentiment prompt is unchanged |

One full run (`pnpm evals`) made 55 model calls: 21 interpreter, 8 prober and 26 guardrail. Using the prices in `config/llm.ts`, that is about $0.73 interpreter after the Batches API discount, $0.25 prober and $0.05 guardrail, so about $1.03 per full run. Two of the seven prober runs needed one guardrail retry each, and both retries succeeded.

## 2026.09.16-1

- The item-descriptor reference (item ID to descriptor for every instrument, plus the unvalidated list) moved out of the dynamic input into a second static system block for the interpreter, prober and summarizer, so it sits under the prompt-cache breakpoint (cost control 1). Input shape sections of `interpreter.v1.md` and `prober.v1.md` updated accordingly; reading rules unchanged. No eval baseline existed before this change.

## 2026.09.15-1

- Initial versions: `interpreter.v1`, `prober.v1`, `summarizer.v1`, `sentiment_flagger.v1`, `guardrail.v1`, `concreteness.v1`.
- Models: prober on `claude-fable-5-1` with server-side fallback to `claude-opus-5`; interpreter, summarizer and sentiment_flagger on `claude-sonnet-5`; guardrail and concreteness on `claude-haiku-4-5-20251001`.
- Temperature 0 for every role except summarizer (0.3). Sent only to models that accept sampling parameters (Haiku 4.5); Fable 5.1, Opus 5 and Sonnet 5 reject `temperature` and run with `output_config.effort` instead (see `config/llm.ts`).
- Structured output: forced tool for every model that supports it; Fable 5.1 rejects forced tool choice, so the prober uses `tool_choice: auto` with a strict tool and an explicit instruction, and a turn without a tool call is treated as a validation failure.
- No eval baseline was recorded for this version; the first live run is under 2026.09.16-2.
