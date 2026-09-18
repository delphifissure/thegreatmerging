/**
 * LLM role configuration. The LLM component is versioned as part of the instrument
 * (principle 6): model snapshot, prompt file, temperature and output schema are pinned
 * together and changed only by an explicit version bump with a CHANGELOG entry.
 *
 * Model identifiers (verified against the Anthropic model documentation bundled with the
 * build tooling on 2026-09-15). The Claude 5 family publishes a single canonical identifier
 * per model and no dated alias that auto-updates, so the identifier itself is the pin:
 *   - claude-fable-5-1 (Claude Fable 5.1)   - claude-opus-5 (Claude Opus 5)
 *   - claude-sonnet-5 (Claude Sonnet 5)     - claude-haiku-4-5-20251001 (Claude Haiku 4.5, dated snapshot)
 * Re-verify with `client.models.retrieve(id)` (scripts/verify_models.ts) before a version bump.
 *
 * Two API constraints shape how lib/llm.ts enforces structured output and sampling:
 *   1. Claude Fable 5.1 rejects forced tool choice (`tool_choice: {type: "tool"}` returns 400).
 *      For that model the wrapper sends `tool_choice: {type: "auto", disable_parallel_tool_use: true}`
 *      with `strict: true` on the tool plus an explicit instruction to call it, and treats a turn
 *      with no tool call as a validation failure (retried once, then raised). Every other model
 *      gets the forced tool exactly as the build prompt specifies.
 *   2. Claude Fable 5.1, Claude Opus 5 and Claude Sonnet 5 reject `temperature` (400). The intended
 *      determinism setting is recorded here for every role; the wrapper sends it only to models
 *      that accept sampling parameters (Claude Haiku 4.5), and uses `output_config.effort` on the
 *      others. Thinking is adaptive-by-default on those models and is not configured explicitly.
 */

export const ROLES = ["prober", "interpreter", "summarizer", "sentiment_flagger", "guardrail", "concreteness", "biographer", "drafter", "mentor"] as const;
export type Role = (typeof ROLES)[number];

export type ModelId = "claude-fable-5-1" | "claude-opus-5" | "claude-sonnet-5" | "claude-haiku-4-5-20251001";

export type ModelCapabilities = {
  /** Accepts `tool_choice: {type: "tool"}`. */
  forced_tool_choice: boolean;
  /** Accepts `temperature` / `top_p` / `top_k`. */
  sampling_params: boolean;
  /** Accepts `output_config.effort`. */
  effort: boolean;
  /** Minimum cacheable prefix in tokens (prompt caching silently no-ops below this). */
  cache_min_tokens: number;
  /** USD per million tokens, for the cost dashboard query. */
  price_per_mtok: { input: number; output: number; cache_read: number; cache_write: number };
};

export const MODEL_CAPABILITIES: Record<ModelId, ModelCapabilities> = {
  "claude-fable-5-1": {
    forced_tool_choice: false,
    sampling_params: false,
    effort: true,
    cache_min_tokens: 512,
    price_per_mtok: { input: 10, output: 50, cache_read: 0.25, cache_write: 12.5 },
  },
  "claude-opus-5": {
    forced_tool_choice: true,
    sampling_params: false,
    effort: true,
    cache_min_tokens: 512,
    price_per_mtok: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  },
  "claude-sonnet-5": {
    forced_tool_choice: true,
    sampling_params: false,
    effort: true,
    cache_min_tokens: 1024,
    price_per_mtok: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  },
  "claude-haiku-4-5-20251001": {
    forced_tool_choice: true,
    sampling_params: true,
    effort: false,
    cache_min_tokens: 4096,
    price_per_mtok: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
  },
};

export type RoleConfig = {
  model: ModelId;
  /** Server-side refusal fallback (Claude Fable 5.1 only). */
  fallback_model?: ModelId;
  /** Intended sampling temperature; sent only when the model accepts it. */
  temperature: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Prompt file under prompts/, e.g. interpreter.v1.md. */
  prompt_file: string;
  prompt_version: string;
  /** Name of the forced tool whose input_schema is the output schema. */
  tool_name: string;
  max_tokens: number;
  /** Non-interactive roles run through the Batches API when LLM_USE_BATCH=1. */
  batchable: boolean;
  /** Text from this role reaches a person, so the guardrail model check runs in addition to the pattern filter. */
  reaches_person: boolean;
};

export const LLM_CONFIG: Record<Role, RoleConfig> = {
  prober: {
    model: "claude-fable-5-1",
    fallback_model: "claude-opus-5",
    temperature: 0,
    effort: "high",
    prompt_file: "prober.v1.md",
    prompt_version: "prober.v1",
    tool_name: "emit_probes",
    max_tokens: 4000,
    batchable: false,
    reaches_person: true,
  },
  interpreter: {
    model: "claude-sonnet-5",
    temperature: 0,
    effort: "medium",
    prompt_file: "interpreter.v2.md",
    prompt_version: "interpreter.v2",
    tool_name: "emit_interpretation",
    max_tokens: 16000,
    batchable: true,
    reaches_person: true,
  },
  summarizer: {
    model: "claude-sonnet-5",
    temperature: 0.3,
    effort: "medium",
    prompt_file: "summarizer.v1.md",
    prompt_version: "summarizer.v1",
    tool_name: "emit_brief",
    max_tokens: 16000,
    batchable: true,
    reaches_person: true,
  },
  sentiment_flagger: {
    model: "claude-sonnet-5",
    temperature: 0,
    effort: "medium",
    prompt_file: "sentiment_flagger.v1.md",
    prompt_version: "sentiment_flagger.v1",
    tool_name: "emit_sentiment_flags",
    max_tokens: 4000,
    batchable: true,
    reaches_person: false,
  },
  guardrail: {
    model: "claude-haiku-4-5-20251001",
    temperature: 0,
    prompt_file: "guardrail.v1.md",
    prompt_version: "guardrail.v1",
    tool_name: "emit_verdict_check",
    max_tokens: 300,
    batchable: false,
    reaches_person: false,
  },
  concreteness: {
    model: "claude-haiku-4-5-20251001",
    temperature: 0,
    prompt_file: "concreteness.v1.md",
    prompt_version: "concreteness.v1",
    tool_name: "emit_concreteness",
    max_tokens: 200,
    batchable: false,
    reaches_person: false,
  },
  // Intervention prototype (docs/concept_intervention.md). Interactive, so never batched.
  biographer: {
    model: "claude-sonnet-5",
    temperature: 0.5,
    effort: "medium",
    prompt_file: "biographer.v2.md",
    prompt_version: "biographer.v2",
    tool_name: "emit_biographer_turn",
    max_tokens: 1500,
    batchable: false,
    reaches_person: true,
  },
  drafter: {
    model: "claude-sonnet-5",
    temperature: 0,
    effort: "medium",
    prompt_file: "drafter.v2.md",
    prompt_version: "drafter.v2",
    tool_name: "emit_document_entries",
    max_tokens: 6000,
    batchable: false,
    reaches_person: true,
  },
  mentor: {
    model: "claude-sonnet-5",
    temperature: 0.5,
    effort: "medium",
    prompt_file: "mentor.v1.md",
    prompt_version: "mentor.v1",
    tool_name: "emit_mentor_reply",
    max_tokens: 1500,
    batchable: false,
    reaches_person: true,
  },
};

/** Bump on any change to a prompt, model, temperature, or output schema. Record it in prompts/CHANGELOG.md. */
export const LLM_CONFIG_VERSION = "2026.09.18-2";
