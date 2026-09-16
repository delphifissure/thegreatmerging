/**
 * The single LLM wrapper. Nothing else in the codebase imports @anthropic-ai/sdk
 * (tests/unit/llm_isolation.test.ts enforces this).
 *
 *   callRole(role, input, schema, ctx)
 *
 * reads the role's model, temperature and prompt file from config/llm.ts; renders the prompt
 * with all static content first and a prompt-cache breakpoint after it; makes the call with the
 * output schema as the forced tool (or, on Claude Fable 5.1 which rejects forced tool choice,
 * tool_choice auto + strict tool + explicit instruction); parses the tool input with the schema;
 * runs the guardrails on every string field; writes an llm_calls row with prompt version and
 * token counts; and on validation or guardrail failure retries once with the error appended to
 * the user turn, then throws.
 *
 * Cost controls: outputs are memoized by (role, prompt_version, input_hash); batchable roles can
 * be submitted through the Batches API with submitBatch/collectBatch; prompts carry item IDs and
 * descriptors, never item text (callers are responsible for that; lib/interpretation builds them).
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { LLM_CONFIG, LLM_CONFIG_VERSION, MODEL_CAPABILITIES, type Role } from "@/config/llm";
import { checkOutput, checkOutputDeterministic, formatViolations, type ModelCheck } from "@/lib/guardrails";
import { hashInput, sha256Hex, stableStringify } from "@/lib/hash";
import { loadRolePrompt } from "@/lib/prompts";
import { GuardrailOutputSchema } from "@/lib/llm/schemas";
import { staticContextFor } from "@/lib/llm/static_context";

export type CallContext = {
  coupleId: string | null;
  userId?: string | null;
  jobStep: string;
  /** Set by collectBatch so the llm_calls row carries the batch id. */
  batchId?: string;
};

export type LlmCallRecord = {
  couple_id: string | null;
  user_id: string | null;
  role: Role;
  model: string;
  prompt_version: string;
  input_hash: string;
  job_step: string;
  batch_id: string | null;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  tokens_in: number;
  tokens_out: number;
  attempt: number;
  outcome: "ok" | "validation_failed" | "guardrail_failed" | "refusal" | "error" | "memo_hit";
};

export interface LlmRecorder {
  record(rec: LlmCallRecord): Promise<void>;
}

export interface LlmMemo {
  get(role: Role, promptVersion: string, inputHash: string): Promise<unknown | undefined>;
  put(role: Role, promptVersion: string, inputHash: string, output: unknown): Promise<void>;
}

export class MemoryRecorder implements LlmRecorder {
  records: LlmCallRecord[] = [];
  async record(rec: LlmCallRecord) {
    this.records.push(rec);
  }
}

export class MemoryMemo implements LlmMemo {
  store = new Map<string, unknown>();
  async get(role: Role, v: string, h: string) {
    return this.store.get(`${role}:${v}:${h}`);
  }
  async put(role: Role, v: string, h: string, output: unknown) {
    this.store.set(`${role}:${v}:${h}`, output);
  }
}

type Deps = {
  client: Anthropic | null;
  recorder: LlmRecorder;
  memo: LlmMemo;
  /**
   * Eval-only diagnostics: called with the rejection message each time an output fails validation
   * or the guardrail. The message can quote model output that paraphrases a person's answers, so
   * jobs and the app never set this.
   */
  onRejected?: (role: Role, kind: "validation_failed" | "guardrail_failed", problem: string, ctx: CallContext) => void;
};

let deps: Deps | undefined;

/** Tests, evals and jobs configure the client, the call recorder and the memo store. */
export function configureLlm(next: Partial<Deps>): void {
  deps = { ...defaultDeps(), ...(deps ?? {}), ...next };
}

function defaultDeps(): Deps {
  return {
    client: process.env.ANTHROPIC_API_KEY ? new Anthropic() : null,
    recorder: new MemoryRecorder(),
    memo: new MemoryMemo(),
  };
}

function getDeps(): Deps {
  if (!deps) deps = defaultDeps();
  return deps;
}

export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly role: Role,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}

export class LlmRefusalError extends Error {
  constructor(role: Role, public readonly category: string | null) {
    super(`${role}: the model declined the request${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

/**
 * JSON Schema keywords the API's strict tool mode does not accept. Zod still enforces every one of
 * them locally when the tool input is parsed, so stripping them from the wire schema loses nothing.
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

export function stripUnsupportedKeywords(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupportedKeywords);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED_SCHEMA_KEYWORDS.has(k)) continue;
      out[k] = stripUnsupportedKeywords(v);
    }
    return out;
  }
  return node;
}

/** Batch custom_ids must match ^[a-zA-Z0-9_-]{1,64}$; keep them readable and collision-resistant. */
export function batchCustomId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (safe === id && id.length <= 64) return id;
  return `${safe.slice(0, 50)}_${sha256Hex(id).slice(0, 12)}`;
}

function toolFor<T>(role: Role, schema: z.ZodType<T>): Anthropic.Beta.BetaTool {
  const cfg = LLM_CONFIG[role];
  const json = stripUnsupportedKeywords(z.toJSONSchema(schema, { target: "draft-07", unrepresentable: "any" })) as Record<string, unknown>;
  delete json.$schema;
  return {
    name: cfg.tool_name,
    description: `Emit the ${role} output. Call this tool exactly once with the complete result.`,
    input_schema: json as Anthropic.Beta.BetaTool["input_schema"],
    strict: true,
  };
}

/** Static system prefix (cached) followed by the dynamic input as the user turn. */
export function buildMessages(role: Role, input: unknown, appended: string[] = []): {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  promptVersion: string;
} {
  const cfg = LLM_CONFIG[role];
  const prompt = loadRolePrompt(role);
  // All static content first (prompt file, then role reference context), one cache breakpoint on the last static block.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: prompt.text }];
  const staticContext = staticContextFor(role);
  if (staticContext) system.push({ type: "text", text: staticContext });
  system[system.length - 1] = { ...system[system.length - 1], cache_control: { type: "ephemeral" } };
  const parts: string[] = [
    `Input (JSON):\n${stableStringify(input)}`,
    `Respond by calling the tool \`${cfg.tool_name}\` exactly once with the complete output. Do not write prose outside the tool call.`,
    ...appended,
  ];
  return { system, messages: [{ role: "user", content: parts.join("\n\n") }], promptVersion: prompt.version };
}

export function buildRequest<T>(
  role: Role,
  input: unknown,
  schema: z.ZodType<T>,
  appended: string[] = [],
): Anthropic.Beta.MessageCreateParamsNonStreaming & { betas?: string[]; fallbacks?: Array<{ model: string }> } {
  const cfg = LLM_CONFIG[role];
  const caps = MODEL_CAPABILITIES[cfg.model];
  const tool = toolFor(role, schema);
  const { system, messages } = buildMessages(role, input, appended);
  const req: Anthropic.Beta.MessageCreateParamsNonStreaming & { betas?: string[]; fallbacks?: Array<{ model: string }> } = {
    model: cfg.model,
    max_tokens: cfg.max_tokens,
    system,
    messages,
    tools: [tool],
    tool_choice: caps.forced_tool_choice
      ? { type: "tool", name: tool.name, disable_parallel_tool_use: true }
      : { type: "auto", disable_parallel_tool_use: true },
  };
  if (caps.sampling_params) req.temperature = cfg.temperature;
  if (caps.effort && cfg.effort) req.output_config = { effort: cfg.effort };
  if (cfg.fallback_model) {
    req.betas = ["server-side-fallback-2026-06-01"];
    req.fallbacks = [{ model: cfg.fallback_model }];
  }
  return req;
}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export type RawModelResult = {
  content: Array<{ type: string; name?: string; input?: unknown }>;
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  usage: Usage;
  model: string;
};

function extractToolInput(role: Role, res: RawModelResult): unknown {
  const cfg = LLM_CONFIG[role];
  if (res.stop_reason === "refusal") {
    throw new LlmRefusalError(role, res.stop_details?.category ?? null);
  }
  const block = res.content.find((b) => b.type === "tool_use" && b.name === cfg.tool_name);
  if (!block) return undefined;
  return block.input;
}

async function usageRecord(role: Role, ctx: CallContext, res: RawModelResult | null, attempt: number, outcome: LlmCallRecord["outcome"], inputHash: string, promptVersion: string): Promise<void> {
  const cfg = LLM_CONFIG[role];
  await getDeps().recorder.record({
    couple_id: ctx.coupleId,
    user_id: ctx.userId ?? null,
    role,
    model: res?.model ?? cfg.model,
    prompt_version: promptVersion,
    input_hash: inputHash,
    job_step: ctx.jobStep,
    batch_id: ctx.batchId ?? null,
    cache_read_tokens: res?.usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: res?.usage.cache_creation_input_tokens ?? 0,
    tokens_in: res?.usage.input_tokens ?? 0,
    tokens_out: res?.usage.output_tokens ?? 0,
    attempt,
    outcome,
  });
}

/**
 * Validate a raw model result: schema, then guardrails. Returns the parsed value or a
 * human-readable problem description to append on retry.
 */
export async function validateResult<T>(
  role: Role,
  res: RawModelResult,
  schema: z.ZodType<T>,
  ctx: CallContext,
): Promise<{ ok: true; value: T } | { ok: false; problem: string; kind: "validation_failed" | "guardrail_failed" }> {
  const cfg = LLM_CONFIG[role];
  const raw = extractToolInput(role, res);
  if (raw === undefined) {
    return { ok: false, kind: "validation_failed", problem: `You did not call the \`${cfg.tool_name}\` tool. Call it exactly once with the full output.` };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`).join("; ");
    return { ok: false, kind: "validation_failed", problem: `Your previous output failed schema validation: ${issues}. Fix these and call the tool again.` };
  }
  // The guardrail role's own output quotes offending text in `reason`; never scan it recursively.
  const guard =
    role === "guardrail"
      ? checkOutputDeterministic({})
      : await checkOutput(parsed.data, {
          reachesPerson: cfg.reaches_person,
          modelCheck: cfg.reaches_person ? guardrailModelCheck(ctx) : undefined,
          skipPaths: role === "prober" ? /\.references\[/ : undefined,
        });
  if (!guard.ok) {
    return {
      ok: false,
      kind: "guardrail_failed",
      problem: `Your previous output was rejected by the language guardrail: ${formatViolations(guard.violations)}. Never state or imply that the relationship should end or continue, that the partners are compatible or incompatible, that a person has a disorder or diagnosis, or characterize a person with a trait word. Refer to the polarization block only with the word "unvalidated". Rewrite and call the tool again.`,
    };
  }
  return { ok: true, value: parsed.data };
}

function guardrailModelCheck(ctx: CallContext): ModelCheck {
  return async (text: string) => callRole("guardrail", { text }, GuardrailOutputSchema, { ...ctx, jobStep: `${ctx.jobStep}:guardrail` });
}

async function invoke(req: ReturnType<typeof buildRequest>): Promise<RawModelResult> {
  const client = getDeps().client;
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set and no client was configured");
  const res = await client.beta.messages.create(req);
  return res as unknown as RawModelResult;
}

/**
 * Direct (non-batch) call with memoization, one retry on validation or guardrail failure,
 * and an llm_calls row for every attempt.
 */
export async function callRole<T>(role: Role, input: unknown, schema: z.ZodType<T>, ctx: CallContext): Promise<T> {
  const cfg = LLM_CONFIG[role];
  const inputHash = hashInput({ role, input, config_version: LLM_CONFIG_VERSION });
  const { memo } = getDeps();
  const promptVersion = cfg.prompt_version;

  const cached = await memo.get(role, promptVersion, inputHash);
  if (cached !== undefined) {
    const parsed = schema.safeParse(cached);
    if (parsed.success) {
      await usageRecord(role, ctx, null, 0, "memo_hit", inputHash, promptVersion);
      return parsed.data;
    }
  }

  const appended: string[] = [];
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const req = buildRequest(role, input, schema, appended);
    let res: RawModelResult;
    try {
      res = await invoke(req);
    } catch (err) {
      await usageRecord(role, ctx, null, attempt, "error", inputHash, promptVersion);
      throw err;
    }
    let verdict: Awaited<ReturnType<typeof validateResult<T>>>;
    try {
      verdict = await validateResult(role, res, schema, ctx);
    } catch (err) {
      await usageRecord(role, ctx, res, attempt, err instanceof LlmRefusalError ? "refusal" : "error", inputHash, promptVersion);
      throw err;
    }
    if (verdict.ok) {
      await usageRecord(role, ctx, res, attempt, "ok", inputHash, promptVersion);
      await memo.put(role, promptVersion, inputHash, verdict.value);
      return verdict.value;
    }
    await usageRecord(role, ctx, res, attempt, verdict.kind, inputHash, promptVersion);
    getDeps().onRejected?.(role, verdict.kind, verdict.problem, ctx);
    lastProblem = verdict.problem;
    appended.push(verdict.problem);
  }
  throw new LlmValidationError(`${role}: output rejected after 2 attempts. ${lastProblem}`, role, 2);
}

// ---------------------------------------------------------------------------------------------
// Batches API (cost control 2): non-interactive roles. submitBatch returns immediately; the job
// polls with collectBatch between Inngest sleeps. Results are validated exactly like direct calls;
// a request whose result fails validation is retried once through the direct path.
// ---------------------------------------------------------------------------------------------

export type BatchItem<T> = { custom_id: string; role: Role; input: unknown; schema: z.ZodType<T>; ctx: CallContext };

export async function submitBatch(items: Array<BatchItem<unknown>>): Promise<{ batch_id: string; skipped: string[] }> {
  const client = getDeps().client;
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set and no client was configured");
  const { memo } = getDeps();
  const skipped: string[] = [];
  const requests: Array<{ custom_id: string; params: ReturnType<typeof buildRequest> }> = [];
  for (const item of items) {
    const inputHash = hashInput({ role: item.role, input: item.input, config_version: LLM_CONFIG_VERSION });
    const cached = await memo.get(item.role, LLM_CONFIG[item.role].prompt_version, inputHash);
    if (cached !== undefined) {
      skipped.push(item.custom_id);
      continue;
    }
    const params = buildRequest(item.role, item.input, item.schema);
    // fallbacks are rejected on the Batches API; batchable roles never configure one.
    delete params.betas;
    delete params.fallbacks;
    requests.push({ custom_id: batchCustomId(item.custom_id), params });
  }
  if (requests.length === 0) return { batch_id: "", skipped };
  const batch = await client.beta.messages.batches.create({ requests: requests as never });
  return { batch_id: batch.id, skipped };
}

export async function batchStatus(batchId: string): Promise<"in_progress" | "canceling" | "ended"> {
  const client = getDeps().client;
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set and no client was configured");
  const b = await client.beta.messages.batches.retrieve(batchId);
  return b.processing_status;
}

/** Collect a finished batch. Items not in the batch (memo hits) or failed items go through callRole. */
export async function collectBatch<T>(batchId: string, items: Array<BatchItem<T>>): Promise<Map<string, T>> {
  const client = getDeps().client;
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set and no client was configured");
  const { memo } = getDeps();
  const byId = new Map(items.map((i) => [batchCustomId(i.custom_id), i]));
  const out = new Map<string, T>();
  const pending = new Set(items.map((i) => i.custom_id));
  if (batchId) {
    for await (const result of await client.beta.messages.batches.results(batchId)) {
      const item = byId.get(result.custom_id);
      if (!item) continue;
      if (result.result.type !== "succeeded") continue; // falls through to the direct retry below
      const res = result.result.message as unknown as RawModelResult;
      const ctx = { ...item.ctx, batchId };
      const inputHash = hashInput({ role: item.role, input: item.input, config_version: LLM_CONFIG_VERSION });
      const promptVersion = LLM_CONFIG[item.role].prompt_version;
      try {
        const verdict = await validateResult(item.role, res, item.schema, ctx);
        if (verdict.ok) {
          await usageRecord(item.role, ctx, res, 1, "ok", inputHash, promptVersion);
          await memo.put(item.role, promptVersion, inputHash, verdict.value);
          out.set(item.custom_id, verdict.value);
          pending.delete(item.custom_id);
        } else {
          await usageRecord(item.role, ctx, res, 1, verdict.kind, inputHash, promptVersion);
          getDeps().onRejected?.(item.role, verdict.kind, verdict.problem, ctx);
        }
      } catch (err) {
        await usageRecord(item.role, ctx, res, 1, err instanceof LlmRefusalError ? "refusal" : "error", inputHash, promptVersion);
      }
    }
  }
  for (const id of pending) {
    const item = byId.get(batchCustomId(id))!;
    out.set(id, await callRole(item.role, item.input, item.schema, item.ctx));
  }
  return out;
}

/** Cost of one llm_calls row in USD, from config/llm.ts prices. */
export function costOfRecord(rec: Pick<LlmCallRecord, "model" | "tokens_in" | "tokens_out" | "cache_read_tokens" | "cache_creation_tokens">): number {
  const caps = MODEL_CAPABILITIES[rec.model as keyof typeof MODEL_CAPABILITIES];
  if (!caps) return 0;
  const p = caps.price_per_mtok;
  return (
    (rec.tokens_in * p.input + rec.tokens_out * p.output + rec.cache_read_tokens * p.cache_read + rec.cache_creation_tokens * p.cache_write) /
    1_000_000
  );
}

/** Model identifiers the account can use, for scripts/verify_models.ts. No message is sent. */
export async function listAvailableModelIds(): Promise<string[]> {
  const client = getDeps().client;
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set and no client was configured");
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  return ids;
}
