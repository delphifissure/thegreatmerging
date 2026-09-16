/**
 * A scripted stand-in for the Anthropic client that lib/llm.ts talks to. It records every
 * request and answers from per-tool queues, so tests can assert the exact request shape
 * (model, tool choice, betas, cache breakpoints) without the network.
 *
 * Only the surface lib/llm.ts uses is implemented: beta.messages.create and
 * beta.messages.batches.{create, retrieve, results}. Wire it in with
 *   configureLlm({ client: fake as unknown as LlmClient, recorder: new MemoryRecorder(), memo: new MemoryMemo() })
 * The name of the SDK package is deliberately absent from this file (see llm_isolation.test.ts).
 */
export type FakeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export type FakeContentBlock = { type: "tool_use"; id: string; name: string; input: unknown } | { type: "text"; text: string };

export type FakeResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: FakeContentBlock[];
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  usage: FakeUsage;
  /** Empty means "echo the requested model". */
  model: string;
};

export type FakeSystemBlock = { type: string; text: string; cache_control?: { type: string } };

/** The request shape lib/llm.ts sends (typed loosely; tests assert on the fields they care about). */
export type FakeRequest = {
  model: string;
  max_tokens: number;
  system: FakeSystemBlock[];
  messages: Array<{ role: string; content: string | unknown[] }>;
  tools: Array<{ name: string; description?: string; input_schema: unknown; strict?: boolean }>;
  tool_choice: { type: string; name?: string; disable_parallel_tool_use?: boolean };
  temperature?: number;
  output_config?: { effort?: string };
  betas?: string[];
  fallbacks?: Array<{ model: string }>;
};

export type BatchResultRow = {
  custom_id: string;
  result: { type: "succeeded"; message: FakeResponse } | { type: "errored" | "canceled" | "expired"; error?: unknown };
};

type Scripted = FakeResponse | ((req: FakeRequest, nth: number) => FakeResponse);

export const DEFAULT_USAGE: FakeUsage = { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 };

let counter = 0;

/** A response whose only block is a tool call with the given input. */
export function toolUseResponse(name: string, input: unknown, overrides: Partial<FakeResponse> = {}): FakeResponse {
  counter += 1;
  return {
    id: `msg_${counter}`,
    type: "message",
    role: "assistant",
    content: [{ type: "tool_use", id: `toolu_${counter}`, name, input }],
    stop_reason: "tool_use",
    usage: { ...DEFAULT_USAGE },
    model: "",
    ...overrides,
  };
}

/** A response with prose and no tool call (Fable 5.1 under tool_choice auto can do this). */
export function textResponse(text: string, overrides: Partial<FakeResponse> = {}): FakeResponse {
  counter += 1;
  return {
    id: `msg_${counter}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { ...DEFAULT_USAGE },
    model: "",
    ...overrides,
  };
}

/** A refusal: stop_reason "refusal" with an optional category in stop_details. */
export function refusalResponse(category: string | null = null, overrides: Partial<FakeResponse> = {}): FakeResponse {
  counter += 1;
  return {
    id: `msg_${counter}`,
    type: "message",
    role: "assistant",
    content: [],
    stop_reason: "refusal",
    stop_details: { category },
    usage: { ...DEFAULT_USAGE, output_tokens: 0 },
    model: "",
    ...overrides,
  };
}

export const GUARDRAIL_TOOL = "emit_verdict_check";

export class FakeAnthropic {
  /** Every request passed to beta.messages.create, in order. */
  requests: FakeRequest[] = [];
  /** Every batch created through beta.messages.batches.create. */
  batches: Array<{ id: string; requests: Array<{ custom_id: string; params: FakeRequest }>; processing_status: "in_progress" | "canceling" | "ended" }> = [];

  private queues = new Map<string, Scripted[]>();
  private defaults = new Map<string, Scripted>();
  private batchResults = new Map<string, BatchResultRow[]>();

  constructor(opts: { autoGuardrail?: boolean } = {}) {
    // Roles that reach a person trigger a guardrail model check through the same client. Unless a
    // test scripts that check explicitly, answer "no verdict found" so the role under test can succeed.
    if (opts.autoGuardrail !== false) {
      this.setDefault(GUARDRAIL_TOOL, () => toolUseResponse(GUARDRAIL_TOOL, { contains_verdict_or_diagnosis: false, reason: "none found" }));
    }
  }

  /** Queue responses for requests whose (single) tool has this name; consumed in order. */
  enqueue(toolName: string, ...responses: Scripted[]): this {
    this.queues.set(toolName, [...(this.queues.get(toolName) ?? []), ...responses]);
    return this;
  }

  /** Fallback used when the queue for a tool is empty. */
  setDefault(toolName: string, response: Scripted): this {
    this.defaults.set(toolName, response);
    return this;
  }

  requestsFor(toolName: string): FakeRequest[] {
    return this.requests.filter((r) => r.tools?.[0]?.name === toolName);
  }

  /** Mark a batch as ended with the given per-request results. */
  endBatch(batchId: string, results: BatchResultRow[]): void {
    const b = this.batches.find((x) => x.id === batchId);
    if (!b) throw new Error(`FakeAnthropic: unknown batch ${batchId}`);
    b.processing_status = "ended";
    this.batchResults.set(batchId, results);
  }

  readonly beta = {
    messages: {
      create: async (req: FakeRequest): Promise<FakeResponse> => this.respond(req),
      batches: {
        create: async (body: { requests: Array<{ custom_id: string; params: FakeRequest }> }) => {
          const id = `msgbatch_${this.batches.length + 1}`;
          this.batches.push({ id, requests: body.requests, processing_status: "in_progress" });
          return { id, type: "message_batch", processing_status: "in_progress" as const };
        },
        retrieve: async (id: string) => {
          const b = this.batches.find((x) => x.id === id);
          if (!b) throw new Error(`FakeAnthropic: unknown batch ${id}`);
          return { id, type: "message_batch", processing_status: b.processing_status };
        },
        results: async (id: string): Promise<AsyncIterable<BatchResultRow>> => {
          const rows = this.batchResults.get(id) ?? [];
          return (async function* () {
            for (const r of rows) yield r;
          })();
        },
      },
    },
  };

  private respond(req: FakeRequest): FakeResponse {
    this.requests.push(req);
    const toolName = req.tools?.[0]?.name ?? "";
    const nth = this.requestsFor(toolName).length;
    const queue = this.queues.get(toolName);
    const scripted = queue && queue.length > 0 ? queue.shift()! : this.defaults.get(toolName);
    if (!scripted) throw new Error(`FakeAnthropic: no scripted response for tool "${toolName}" (request #${this.requests.length})`);
    const res = typeof scripted === "function" ? scripted(req, nth) : scripted;
    return { ...res, model: res.model || req.model };
  }
}
