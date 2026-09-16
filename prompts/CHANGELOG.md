# Prompt and model changelog

The LLM component is versioned as part of the instrument. Any change to a prompt file, a model identifier, a temperature, an effort setting, or an output schema requires a version bump here and, when it alters any eval result, a note of which evals changed.

## 2026.09.16-1

- The item-descriptor reference (item ID to descriptor for every instrument, plus the unvalidated list) moved out of the dynamic input into a second static system block for the interpreter, prober and summarizer, so it sits under the prompt-cache breakpoint (cost control 1). Input shape sections of `interpreter.v1.md` and `prober.v1.md` updated accordingly; reading rules unchanged. No eval baseline existed before this change.

## 2026.09.15-1

- Initial versions: `interpreter.v1`, `prober.v1`, `summarizer.v1`, `sentiment_flagger.v1`, `guardrail.v1`, `concreteness.v1`.
- Models: prober on `claude-fable-5-1` with server-side fallback to `claude-opus-5`; interpreter, summarizer and sentiment_flagger on `claude-sonnet-5`; guardrail and concreteness on `claude-haiku-4-5-20251001`.
- Temperature 0 for every role except summarizer (0.3). Sent only to models that accept sampling parameters (Haiku 4.5); Fable 5.1, Opus 5 and Sonnet 5 reject `temperature` and run with `output_config.effort` instead (see `config/llm.ts`).
- Structured output: forced tool for every model that supports it; Fable 5.1 rejects forced tool choice, so the prober uses `tool_choice: auto` with a strict tool and an explicit instruction, and a turn without a tool call is treated as a validation failure.
- Eval baseline: to be recorded on the first `pnpm evals` run with an API key.
