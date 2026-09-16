/**
 * lib/llm callRole against a scripted fake client: request shape per model, prompt caching
 * breakpoint, schema and guardrail retries, refusals, memoization, llm_calls records, the
 * batch path, and the cost helper. No network.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { LLM_CONFIG, MODEL_CAPABILITIES } from "@/config/llm";
import { stableStringify } from "@/lib/hash";
import {
  batchStatus,
  callRole,
  collectBatch,
  configureLlm,
  costOfRecord,
  LlmRefusalError,
  LlmValidationError,
  MemoryMemo,
  MemoryRecorder,
  submitBatch,
  type BatchItem,
} from "@/lib/llm";
import {
  ConcretenessOutputSchema,
  GuardrailOutputSchema,
  InterpreterOutputSchema,
  ProberOutputSchema,
  SentimentFlaggerOutputSchema,
  SummarizerOutputSchema,
  type InterpreterOutput,
  type ProberOutput,
  type SentimentFlaggerOutput,
  type SummarizerOutput,
} from "@/lib/llm/schemas";
import { FakeAnthropic, GUARDRAIL_TOOL, refusalResponse, textResponse, toolUseResponse } from "@/tests/unit/helpers/fake_anthropic";

type LlmClient = NonNullable<Parameters<typeof configureLlm>[0]["client"]>;

const ctx = { coupleId: "couple-1", userId: "user-a", jobStep: "test-step" };

// Minimal valid outputs for every schema, worded so the deterministic guardrail passes.
const interpreterOutput: InterpreterOutput = {
  distress_note: null,
  domains: [
    {
      domain: "household",
      aligned: [{ item: "household chores", one_sentence: "You both rated household chores as needing no change." }],
      low_intensity_misaligned: [],
      flagged: [],
    },
  ],
  private_summaries: [
    { user: "a", sentences: [{ instrument_key: "csi16", sentence: "Your CSI-16 total is 70, in the non distressed range." }] },
    { user: "b", sentences: [] },
  ],
};

const proberOutput: ProberOutput = {
  probes: [
    {
      template_id: 4,
      question_text: "What's the value under this?",
      reason_text: "You tagged this a requirement and described it as something you could live without.",
      references: ["household_t3", "household_p2"],
    },
  ],
};

const summarizerOutput: SummarizerOutput = {
  brief: {
    domain: "household",
    what_each_would_do: { a: "A would ask before moving anything in a shared space.", b: "B would move things and mention it afterwards." },
    values_underneath: { a: "Being consulted.", b: "Getting things done." },
    tags_side_by_side: [],
    perception_gaps: [],
    polarization_loops: [],
    consistency_notes: [],
    aligned_items: ["household chores"],
    parked_items: [],
  },
};

const sentimentOutput: SentimentFlaggerOutput = {
  flags: [{ marker: "criticism", quoted_span: "you never help with the dishes", confidence: 0.6, source_answer_id: "ans_1" }],
};

let fake: FakeAnthropic;
let recorder: MemoryRecorder;
let memo: MemoryMemo;

beforeEach(() => {
  fake = new FakeAnthropic();
  recorder = new MemoryRecorder();
  memo = new MemoryMemo();
  configureLlm({ client: fake as unknown as LlmClient, recorder, memo });
});

const userTurn = (i: number) => fake.requests[i].messages[0].content as string;
const outcomes = (role: string) => recorder.records.filter((r) => r.role === role).map((r) => [r.attempt, r.outcome]);

describe("callRole: happy path and memoization", () => {
  it("parses the tool input with the schema, records one ok row, and memoizes", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: true }));
    const input = { question_text: "How do you enforce a limit?", answer_text: "Last night I took the tablet away at 8pm." };

    const out = await callRole("concreteness", input, ConcretenessOutputSchema, ctx);
    expect(out).toEqual({ concrete: true });
    expect(fake.requests).toHaveLength(1);
    expect(recorder.records).toEqual([
      {
        couple_id: "couple-1",
        user_id: "user-a",
        role: "concreteness",
        model: "claude-haiku-4-5-20251001",
        prompt_version: LLM_CONFIG.concreteness.prompt_version,
        input_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        job_step: "test-step",
        batch_id: null,
        cache_read_tokens: 1000,
        cache_creation_tokens: 0,
        tokens_in: 1200,
        tokens_out: 80,
        attempt: 1,
        outcome: "ok",
      },
    ]);
    expect(recorder.records[0].prompt_version).toBe("concreteness.v1");

    // Same input (different key order) is served from the memo: no client request, a memo_hit row.
    const again = await callRole("concreteness", { answer_text: input.answer_text, question_text: input.question_text }, ConcretenessOutputSchema, ctx);
    expect(again).toEqual({ concrete: true });
    expect(fake.requests).toHaveLength(1);
    expect(recorder.records).toHaveLength(2);
    expect(recorder.records[1]).toMatchObject({ role: "concreteness", outcome: "memo_hit", attempt: 0, tokens_in: 0, tokens_out: 0, input_hash: recorder.records[0].input_hash });

    // A different input is a new call.
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: false }));
    expect(await callRole("concreteness", { ...input, answer_text: "We talk." }, ConcretenessOutputSchema, ctx)).toEqual({ concrete: false });
    expect(fake.requests).toHaveLength(2);
  });

  it("ignores a memo entry that no longer satisfies the schema", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: true }));
    const input = { question_text: "q", answer_text: "a" };
    await callRole("concreteness", input, ConcretenessOutputSchema, ctx);
    for (const k of memo.store.keys()) memo.store.set(k, { stale: true });
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: false }));
    expect(await callRole("concreteness", input, ConcretenessOutputSchema, ctx)).toEqual({ concrete: false });
    expect(fake.requests).toHaveLength(2);
  });

  it("throws when no client is configured", async () => {
    configureLlm({ client: null });
    await expect(callRole("concreteness", { q: 1 }, ConcretenessOutputSchema, ctx)).rejects.toThrow(/no client was configured/);
  });
});

describe("callRole: schema validation retry", () => {
  it("appends the validation error to the second user turn and succeeds on attempt 2", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: "yes" }), toolUseResponse("emit_concreteness", { concrete: false }));
    const out = await callRole("concreteness", { q: 1 }, ConcretenessOutputSchema, ctx);
    expect(out).toEqual({ concrete: false });
    expect(fake.requests).toHaveLength(2);
    expect(userTurn(0)).not.toContain("failed schema validation");
    expect(userTurn(1)).toContain("Your previous output failed schema validation: concrete:");
    expect(userTurn(1)).toContain("Fix these and call the tool again.");
    expect(outcomes("concreteness")).toEqual([
      [1, "validation_failed"],
      [2, "ok"],
    ]);
  });

  it("throws LlmValidationError when both attempts fail and memoizes nothing", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: "yes" }), toolUseResponse("emit_concreteness", { nope: 1 }));
    const err = await callRole("concreteness", { q: 2 }, ConcretenessOutputSchema, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmValidationError);
    expect(err).toMatchObject({ role: "concreteness", attempts: 2, name: "LlmValidationError" });
    expect((err as Error).message).toContain("output rejected after 2 attempts");
    expect(fake.requests).toHaveLength(2);
    expect(outcomes("concreteness")).toEqual([
      [1, "validation_failed"],
      [2, "validation_failed"],
    ]);
    expect(memo.store.size).toBe(0);
  });
});

describe("callRole: guardrail retry", () => {
  const bad: InterpreterOutput = {
    ...interpreterOutput,
    domains: [{ domain: "household", aligned: [], low_intensity_misaligned: [], flagged: [{ item: "household chores", plain_reason: "You two should break up over the chores.", weight: 2 }] }],
  };

  it("retries once with the guardrail text appended, then throws LlmValidationError", async () => {
    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", bad), toolUseResponse("emit_interpretation", bad));
    await expect(callRole("interpreter", { k: 1 }, InterpreterOutputSchema, ctx)).rejects.toBeInstanceOf(LlmValidationError);
    expect(fake.requestsFor("emit_interpretation")).toHaveLength(2);
    // The deterministic filter failed first, so the model check was never asked.
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(0);
    const second = fake.requestsFor("emit_interpretation")[1].messages[0].content as string;
    expect(second).toContain("rejected by the language guardrail");
    expect(second).toContain("relationship_verdict at $.domains[0].flagged[0].plain_reason");
    expect(second).toContain("should break up");
    expect(second).toContain('Refer to the polarization block only with the word "unvalidated"');
    expect(outcomes("interpreter")).toEqual([
      [1, "guardrail_failed"],
      [2, "guardrail_failed"],
    ]);
  });

  it("a clean rewrite on attempt 2 succeeds and is memoized", async () => {
    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", bad), toolUseResponse("emit_interpretation", interpreterOutput));
    const out = await callRole("interpreter", { k: 2 }, InterpreterOutputSchema, ctx);
    expect(out).toEqual(interpreterOutput);
    expect(outcomes("interpreter")).toEqual([
      [1, "guardrail_failed"],
      [2, "ok"],
    ]);
    // Attempt 2 passed the deterministic filter, so the model check ran once, under its own job step.
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(1);
    expect(recorder.records.filter((r) => r.role === "guardrail")).toEqual([expect.objectContaining({ outcome: "ok", job_step: "test-step:guardrail", model: "claude-haiku-4-5-20251001" })]);
    expect(memo.store.size).toBe(2);
  });

  it("a model-check verdict of true is a guardrail failure with category model", async () => {
    // The rewrite must differ: guardrail verdicts are memoized by text, so an identical rewrite gets the same verdict.
    const rewrite: InterpreterOutput = { ...interpreterOutput, distress_note: "Relationship scores are read under distress this time." };
    fake.enqueue(GUARDRAIL_TOOL, toolUseResponse(GUARDRAIL_TOOL, { contains_verdict_or_diagnosis: true, reason: "implies they are a poor match" }));
    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", interpreterOutput), toolUseResponse("emit_interpretation", rewrite));
    const out = await callRole("interpreter", { k: 3 }, InterpreterOutputSchema, ctx);
    expect(out).toEqual(rewrite);
    expect(outcomes("interpreter")).toEqual([
      [1, "guardrail_failed"],
      [2, "ok"],
    ]);
    const second = fake.requestsFor("emit_interpretation")[1].messages[0].content as string;
    expect(second).toContain('model: "implies they are a poor match"');
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(2);
    expect(outcomes("guardrail")).toEqual([
      [1, "ok"],
      [1, "ok"],
    ]);
  });

  it("an identical rewrite is judged from the memoized guardrail verdict and still fails", async () => {
    fake.enqueue(GUARDRAIL_TOOL, toolUseResponse(GUARDRAIL_TOOL, { contains_verdict_or_diagnosis: true, reason: "implies a verdict" }));
    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", interpreterOutput), toolUseResponse("emit_interpretation", interpreterOutput));
    await expect(callRole("interpreter", { k: 4 }, InterpreterOutputSchema, ctx)).rejects.toBeInstanceOf(LlmValidationError);
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(1);
    expect(outcomes("guardrail")).toEqual([
      [1, "ok"],
      [0, "memo_hit"],
    ]);
  });
});

describe("callRole: request shape per model", () => {
  it("prober on Claude Fable 5.1: tool_choice auto, strict tool, fallback beta, effort, no temperature", async () => {
    fake.enqueue("emit_probes", toolUseResponse("emit_probes", proberOutput));
    await callRole("prober", { answers: [] }, ProberOutputSchema, ctx);
    const req = fake.requestsFor("emit_probes")[0];
    expect(req.model).toBe("claude-fable-5-1");
    expect(req.max_tokens).toBe(LLM_CONFIG.prober.max_tokens);
    expect(req.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(req.tools).toHaveLength(1);
    expect(req.tools[0]).toMatchObject({ name: "emit_probes", strict: true });
    expect(req.tools[0].input_schema).toMatchObject({ type: "object", properties: { probes: expect.anything() } });
    expect(req.tools[0].input_schema).not.toHaveProperty("$schema");
    expect(req.betas).toEqual(["server-side-fallback-2026-06-01"]);
    expect(req.fallbacks).toEqual([{ model: "claude-opus-5" }]);
    expect(req).not.toHaveProperty("temperature");
    expect(req.output_config).toEqual({ effort: "high" });
  });

  it("prober: a turn with no tool_use block is a validation failure that is retried", async () => {
    fake.enqueue("emit_probes", textResponse("Here is what I noticed instead of calling the tool."), toolUseResponse("emit_probes", proberOutput));
    const out = await callRole("prober", { answers: ["x"] }, ProberOutputSchema, ctx);
    expect(out).toEqual(proberOutput);
    const reqs = fake.requestsFor("emit_probes");
    expect(reqs).toHaveLength(2);
    expect(reqs[1].messages[0].content as string).toContain("You did not call the `emit_probes` tool. Call it exactly once with the full output.");
    expect(outcomes("prober")).toEqual([
      [1, "validation_failed"],
      [2, "ok"],
    ]);
  });

  it("interpreter on Claude Sonnet 5: forced tool, effort medium, no temperature, no fallback", async () => {
    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", interpreterOutput));
    await callRole("interpreter", { k: 1 }, InterpreterOutputSchema, ctx);
    const req = fake.requestsFor("emit_interpretation")[0];
    expect(req.model).toBe("claude-sonnet-5");
    expect(req.tool_choice).toEqual({ type: "tool", name: "emit_interpretation", disable_parallel_tool_use: true });
    expect(req.tools[0]).toMatchObject({ name: "emit_interpretation", strict: true });
    expect(req).not.toHaveProperty("temperature");
    expect(req.output_config).toEqual({ effort: "medium" });
    expect(req).not.toHaveProperty("betas");
    expect(req).not.toHaveProperty("fallbacks");
  });

  it("guardrail on Claude Haiku 4.5: temperature 0 and no output_config", async () => {
    fake.enqueue(GUARDRAIL_TOOL, toolUseResponse(GUARDRAIL_TOOL, { contains_verdict_or_diagnosis: false, reason: "none found" }));
    const out = await callRole("guardrail", { text: "You rated chores +2." }, GuardrailOutputSchema, ctx);
    expect(out).toEqual({ contains_verdict_or_diagnosis: false, reason: "none found" });
    const req = fake.requestsFor(GUARDRAIL_TOOL)[0];
    expect(req.model).toBe("claude-haiku-4-5-20251001");
    expect(req.temperature).toBe(0);
    expect(req).not.toHaveProperty("output_config");
    expect(req.tool_choice).toEqual({ type: "tool", name: GUARDRAIL_TOOL, disable_parallel_tool_use: true });
  });

  it("the guardrail role's own output is never scanned recursively", async () => {
    fake.enqueue(GUARDRAIL_TOOL, toolUseResponse(GUARDRAIL_TOOL, { contains_verdict_or_diagnosis: true, reason: 'quotes "you two should break up"' }));
    const out = await callRole("guardrail", { text: "You two should break up." }, GuardrailOutputSchema, ctx);
    expect(out.contains_verdict_or_diagnosis).toBe(true);
    expect(fake.requests).toHaveLength(1);
  });

  it("the summarizer sends its temperature only where the model accepts it (Sonnet 5 does not)", async () => {
    fake.enqueue("emit_brief", toolUseResponse("emit_brief", summarizerOutput));
    await callRole("summarizer", { domain: "household" }, SummarizerOutputSchema, ctx);
    const req = fake.requestsFor("emit_brief")[0];
    expect(LLM_CONFIG.summarizer.temperature).toBe(0.3);
    expect(req).not.toHaveProperty("temperature");
    expect(req.output_config).toEqual({ effort: "medium" });
  });
});

describe("callRole: refusal", () => {
  it("stop_reason refusal raises LlmRefusalError without a retry and records a refusal row", async () => {
    fake.enqueue("emit_interpretation", refusalResponse("harmful_content"));
    const err = await callRole("interpreter", { k: 9 }, InterpreterOutputSchema, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRefusalError);
    expect(err).toMatchObject({ name: "LlmRefusalError", category: "harmful_content" });
    expect((err as Error).message).toBe("interpreter: the model declined the request (harmful_content)");
    expect(fake.requests).toHaveLength(1);
    expect(outcomes("interpreter")).toEqual([[1, "refusal"]]);
  });

  it("a client error is recorded as error and rethrown", async () => {
    fake.enqueue("emit_concreteness", () => {
      throw new Error("boom");
    });
    await expect(callRole("concreteness", { k: 1 }, ConcretenessOutputSchema, ctx)).rejects.toThrow("boom");
    expect(outcomes("concreteness")).toEqual([[1, "error"]]);
  });
});

describe("callRole: prompt rendering", () => {
  it("the system prompt is the prompt file with a cache breakpoint on its last block; the user turn carries the stable JSON input", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: true }));
    const input = { question_text: "Q", answer_text: "A", nested: { z: 1, a: [1, 2] } };
    await callRole("concreteness", input, ConcretenessOutputSchema, ctx);
    const req = fake.requests[0];
    expect(Array.isArray(req.system)).toBe(true);
    const last = req.system[req.system.length - 1];
    expect(last.cache_control).toEqual({ type: "ephemeral" });
    expect(last.type).toBe("text");
    const promptFile = fs.readFileSync(path.join(process.cwd(), "prompts", LLM_CONFIG.concreteness.prompt_file), "utf8");
    expect(last.text).toBe(promptFile);
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe("user");
    const turn = req.messages[0].content as string;
    expect(turn).toContain(`Input (JSON):\n${stableStringify(input)}`);
    expect(turn).toContain("Respond by calling the tool `emit_concreteness` exactly once with the complete output.");
  });

  it("every role's prompt file loads and is non-empty", () => {
    for (const cfg of Object.values(LLM_CONFIG)) {
      const text = fs.readFileSync(path.join(process.cwd(), "prompts", cfg.prompt_file), "utf8");
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("ProberOutputSchema: template wording is enforced", () => {
  const probe = (template_id: number, question_text: string) => ({ template_id, question_text, reason_text: "Two things you said seem to sit in tension.", references: ["a1"] });

  it.each([
    [4, "What's the value under this?"],
    [1, "You answered that you want to be asked first here and no change on chores in household. Help me understand how those fit together."],
    [2, "Your RDAS consensus score suggests broad agreement, and here you said you disagree most weeks. How do those fit for you?"],
  ])("accepts template %i filled exactly", (id, text) => {
    expect(ProberOutputSchema.safeParse({ probes: [probe(id, text)] }).success).toBe(true);
  });

  it("accepts surrounding whitespace and an empty probe list", () => {
    expect(ProberOutputSchema.safeParse({ probes: [probe(7, "  What would change your mind? ")] }).success).toBe(true);
    expect(ProberOutputSchema.safeParse({ probes: [] }).success).toBe(true);
  });

  it.each([
    ["a paraphrase", 4, "What value sits under this?"],
    ["a trailing extra sentence", 4, "What's the value under this? Take your time."],
    ["the wrong template id for the text", 6, "What would change your mind?"],
  ])("rejects %s", (_label, id, text) => {
    const res = ProberOutputSchema.safeParse({ probes: [probe(id, text)] });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues.some((i) => i.path.join(".") === "probes.0.question_text")).toBe(true);
  });

  it("rejects more than three probes and unknown template ids", () => {
    expect(ProberOutputSchema.safeParse({ probes: [1, 2, 3, 4].map(() => probe(4, "What's the value under this?")) }).success).toBe(false);
    expect(ProberOutputSchema.safeParse({ probes: [probe(8, "What's the value under this?")] }).success).toBe(false);
  });
});

describe("guardrail model check is invoked only for roles whose text reaches a person", () => {
  it("interpreter, prober and summarizer each trigger exactly one emit_verdict_check call", async () => {
    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", interpreterOutput));
    await callRole("interpreter", { k: 1 }, InterpreterOutputSchema, ctx);
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(1);

    fake.enqueue("emit_probes", toolUseResponse("emit_probes", proberOutput));
    await callRole("prober", { k: 1 }, ProberOutputSchema, ctx);
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(2);

    fake.enqueue("emit_brief", toolUseResponse("emit_brief", summarizerOutput));
    await callRole("summarizer", { k: 1 }, SummarizerOutputSchema, ctx);
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(3);

    for (const req of fake.requestsFor(GUARDRAIL_TOOL)) {
      expect(req.model).toBe("claude-haiku-4-5-20251001");
      expect(req.messages[0].content as string).toContain('"text":');
    }
    expect(recorder.records.filter((r) => r.role === "guardrail").map((r) => r.job_step)).toEqual(["test-step:guardrail", "test-step:guardrail", "test-step:guardrail"]);
  });

  it("the prober's references are excluded from the text sent to the model check", async () => {
    fake.enqueue("emit_probes", toolUseResponse("emit_probes", proberOutput));
    await callRole("prober", { k: 2 }, ProberOutputSchema, ctx);
    const check = fake.requestsFor(GUARDRAIL_TOOL)[0].messages[0].content as string;
    expect(check).toContain("What's the value under this?");
    expect(check).not.toContain("household_t3");
  });

  it("concreteness and sentiment_flagger never trigger it", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: true }));
    await callRole("concreteness", { k: 1 }, ConcretenessOutputSchema, ctx);
    fake.enqueue("emit_sentiment_flags", toolUseResponse("emit_sentiment_flags", sentimentOutput));
    const flags = await callRole("sentiment_flagger", { k: 1 }, SentimentFlaggerOutputSchema, ctx);
    expect(flags).toEqual(sentimentOutput);
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(0);
    expect(fake.requests).toHaveLength(2);
  });

  it("the deterministic filter still applies to roles that do not reach a person", async () => {
    const bad: SentimentFlaggerOutput = { flags: [{ ...sentimentOutput.flags[0], quoted_span: "you are a narcissist" }] };
    fake.enqueue("emit_sentiment_flags", toolUseResponse("emit_sentiment_flags", bad), toolUseResponse("emit_sentiment_flags", bad));
    await expect(callRole("sentiment_flagger", { k: 2 }, SentimentFlaggerOutputSchema, ctx)).rejects.toBeInstanceOf(LlmValidationError);
    expect(outcomes("sentiment_flagger")).toEqual([
      [1, "guardrail_failed"],
      [2, "guardrail_failed"],
    ]);
    expect(fake.requestsFor(GUARDRAIL_TOOL)).toHaveLength(0);
  });
});

describe("batches", () => {
  it("submitBatch skips memo hits and strips fallbacks; collectBatch validates results and retries failures directly", async () => {
    fake.enqueue("emit_sentiment_flags", toolUseResponse("emit_sentiment_flags", sentimentOutput));
    await callRole("sentiment_flagger", { answers: ["x"] }, SentimentFlaggerOutputSchema, ctx);
    expect(fake.requests).toHaveLength(1);

    const items = [
      { custom_id: "memo", role: "sentiment_flagger", input: { answers: ["x"] }, schema: SentimentFlaggerOutputSchema, ctx },
      { custom_id: "fresh", role: "interpreter", input: { k: 1 }, schema: InterpreterOutputSchema, ctx },
      { custom_id: "broken", role: "interpreter", input: { k: 2 }, schema: InterpreterOutputSchema, ctx },
    ] as unknown as Array<BatchItem<unknown>>;

    const { batch_id, skipped } = await submitBatch(items);
    expect(skipped).toEqual(["memo"]);
    expect(batch_id).toBe("msgbatch_1");
    expect(fake.batches[0].requests.map((r) => r.custom_id)).toEqual(["fresh", "broken"]);
    for (const r of fake.batches[0].requests) {
      expect(r.params).not.toHaveProperty("betas");
      expect(r.params).not.toHaveProperty("fallbacks");
      expect(r.params.tool_choice).toEqual({ type: "tool", name: "emit_interpretation", disable_parallel_tool_use: true });
    }
    expect(await batchStatus(batch_id)).toBe("in_progress");

    fake.endBatch(batch_id, [
      { custom_id: "fresh", result: { type: "succeeded", message: toolUseResponse("emit_interpretation", interpreterOutput, { model: "claude-sonnet-5" }) } },
      { custom_id: "broken", result: { type: "errored", error: { type: "api_error" } } },
    ]);
    expect(await batchStatus(batch_id)).toBe("ended");

    fake.enqueue("emit_interpretation", toolUseResponse("emit_interpretation", interpreterOutput));
    const out = await collectBatch(batch_id, items);
    expect([...out.keys()].sort()).toEqual(["broken", "fresh", "memo"]);
    expect(out.get("fresh")).toEqual(interpreterOutput);
    expect(out.get("memo")).toEqual(sentimentOutput);
    // Only the failed item went through the direct path.
    expect(fake.requestsFor("emit_interpretation")).toHaveLength(1);
    const batchRow = recorder.records.find((r) => r.batch_id === batch_id && r.role === "interpreter");
    expect(batchRow).toMatchObject({ outcome: "ok", attempt: 1, model: "claude-sonnet-5" });
    expect(recorder.records.filter((r) => r.role === "sentiment_flagger").map((r) => r.outcome)).toEqual(["ok", "memo_hit"]);
  });

  it("submitBatch with nothing to send returns an empty batch id", async () => {
    fake.enqueue("emit_concreteness", toolUseResponse("emit_concreteness", { concrete: true }));
    await callRole("concreteness", { k: 1 }, ConcretenessOutputSchema, ctx);
    const res = await submitBatch([{ custom_id: "only", role: "concreteness", input: { k: 1 }, schema: ConcretenessOutputSchema, ctx }] as unknown as Array<BatchItem<unknown>>);
    expect(res).toEqual({ batch_id: "", skipped: ["only"] });
    expect(fake.batches).toHaveLength(0);
  });
});

describe("costOfRecord", () => {
  it("uses the configured per-model prices", () => {
    const rec = { model: "claude-sonnet-5", tokens_in: 1_000_000, tokens_out: 100_000, cache_read_tokens: 500_000, cache_creation_tokens: 200_000 };
    const p = MODEL_CAPABILITIES["claude-sonnet-5"].price_per_mtok;
    const expected = (rec.tokens_in * p.input + rec.tokens_out * p.output + rec.cache_read_tokens * p.cache_read + rec.cache_creation_tokens * p.cache_write) / 1_000_000;
    expect(costOfRecord(rec)).toBeCloseTo(expected, 10);
    expect(costOfRecord(rec)).toBeCloseTo(2 + 1 + 0.1 + 0.5, 10);
  });

  it("prices Fable 5.1 and Haiku 4.5 differently and returns 0 for an unknown model", () => {
    const base = { tokens_in: 1_000_000, tokens_out: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
    expect(costOfRecord({ ...base, model: "claude-fable-5-1" })).toBe(10);
    expect(costOfRecord({ ...base, model: "claude-haiku-4-5-20251001" })).toBe(1);
    expect(costOfRecord({ ...base, model: "claude-opus-5" })).toBe(5);
    expect(costOfRecord({ ...base, model: "gpt-nope" })).toBe(0);
  });
});
