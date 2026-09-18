/**
 * Eval harness (section 10). Usage:
 *   pnpm evals                       run every suite
 *   pnpm evals --suite scoring       scoring | synthetic_couples | interpreter | prober | biographer | mentor
 *   pnpm evals --out evals/results/run.json
 *   pnpm evals --suite interpreter --interpreter-batch msgbatch_...   collect an already-submitted batch
 *   pnpm evals --suite prober --dump evals/results/outputs              keep raw outputs for review
 *
 * Exit code is non-zero if any check fails. The interpreter and prober suites need
 * ANTHROPIC_API_KEY; without it they are reported as skipped and the run fails only if
 * --require-llm is passed (CI passes it).
 *
 * Checks:
 *   scoring            golden cases from evals/scoring/golden.json reproduce exactly
 *   synthetic_couples  every synthetic couple's flags, domains, loops and distress match expected exactly
 *   interpreter        schema validity, no prohibited language, mental-health masking respected,
 *                      unvalidated label wherever polarization is referenced
 *   prober             planted contradictions found, none invented on clean sets, templates only
 *   sentiment          hand-coded marker set for the clinician-layer flagger (gate before enabling)
 *   biographer         one question per turn, no advice or verdicts, places a stated value beside a described
 *                      behaviour and cites both, offers to stop when the person is tired
 *   mentor             the one-notch-ahead avatar speaks in the first person from ratified lines, says when it
 *                      does not know, holds settled requirements, never labels the partner
 */
import "@/lib/load_env";
import fs from "node:fs";
import type { ZodType } from "zod";
import path from "node:path";
import { INSTRUMENTS, isInstrumentKey } from "@/instruments/registry";
import { scaleFor } from "@/instruments/define";
import type { Response } from "@/instruments/schema";
import { runStage1 } from "@/lib/interpretation/stage1";
import { buildInterpreterInput, interpreterOutputSchemaFor, type InterpreterInput } from "@/lib/interpretation/stage2";
import { BiographerTurnSchema, InterpreterOutputSchema, MentorReplySchema, ProberOutputSchema, SentimentFlaggerOutputSchema, type InterpreterOutput, type ProberOutput } from "@/lib/llm/schemas";
import { buildRequest, callRole, costOfRecord, collectBatch, batchStatus, submitBatch, configureLlm, MemoryMemo, MemoryRecorder, LlmValidationError, type BatchItem } from "@/lib/llm";
import { checkOutputDeterministic } from "@/lib/guardrails";
import { answerProfile, biographerTurnSchemaFor, optionsFor } from "@/lib/biographer/inputs";
import { interpreterFindings, MENTAL_HEALTH_KEYS } from "@/evals/interpreter_checks";
import { LLM_CONFIG, LLM_CONFIG_VERSION } from "@/config/llm";

type Check = { suite: string; id: string; ok: boolean; detail?: string };

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const suite = argOf("--suite") ?? "all";
const outPath = argOf("--out");
const requireLlm = args.includes("--require-llm");
/** --dry-run builds every model request (prompt, tool schema, input) without calling the API and writes them under evals/results/dry-run/. */
const dryRun = args.includes("--dry-run");
/** --interpreter-batch resumes an interpreter batch that was submitted by an earlier run instead of paying for a new one. */
const resumeBatchId = argOf("--interpreter-batch");
/** --dump DIR writes each model output (synthetic data only) next to its input for review. */
const dumpDir = argOf("--dump");
const checks: Check[] = [];
const recorder = new MemoryRecorder();

function record(c: Check) {
  checks.push(c);
  const mark = c.ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${c.suite}/${c.id}${c.detail ? `  ${c.detail}` : ""}`);
}

function approx(a: number, b: number) {
  return Math.abs(a - b) < 1e-9;
}

// ---------------------------------------------------------------- scoring
function runScoring() {
  const golden = JSON.parse(fs.readFileSync(path.join("evals", "scoring", "golden.json"), "utf8")) as {
    cases: Array<{ id: string; instrument: string; values?: number[]; values_by_pass?: Record<string, number[]>; expected: Record<string, { value: number; cutoff_label?: string | null }> }>;
  };
  for (const c of golden.cases) {
    if (!isInstrumentKey(c.instrument)) {
      record({ suite: "scoring", id: c.id, ok: false, detail: `unknown instrument ${c.instrument}` });
      continue;
    }
    const mod = INSTRUMENTS[c.instrument];
    const def = mod.definition;
    const responses: Response[] = [];
    if (c.values) {
      c.values.forEach((v, i) => responses.push({ item_id: def.items[i].item_id, value: v, pass: def.passes[0] }));
    } else if (c.values_by_pass) {
      for (const [pass, vals] of Object.entries(c.values_by_pass)) vals.forEach((v, i) => responses.push({ item_id: def.items[i].item_id, value: v, pass }));
    }
    try {
      const scores = mod.score(responses);
      const problems: string[] = [];
      for (const [sub, exp] of Object.entries(c.expected)) {
        const s = scores.find((x) => x.subscale === sub);
        if (!s) problems.push(`missing subscale ${sub}`);
        else {
          if (!approx(s.value, exp.value)) problems.push(`${sub}: value ${s.value} != ${exp.value}`);
          if (exp.cutoff_label !== undefined && s.cutoff_label !== exp.cutoff_label) problems.push(`${sub}: label ${s.cutoff_label} != ${exp.cutoff_label}`);
        }
      }
      record({ suite: "scoring", id: c.id, ok: problems.length === 0, detail: problems.join("; ") });
    } catch (err) {
      record({ suite: "scoring", id: c.id, ok: false, detail: String(err) });
    }
  }
  // Structural: every instrument's max and min are reproducible from its definition.
  for (const mod of Object.values(INSTRUMENTS)) {
    const def = mod.definition;
    const fill = (pick: (min: number, max: number) => number): Response[] =>
      def.passes.flatMap((pass) => def.items.map((it) => ({ item_id: it.item_id, pass, value: pick(scaleFor(it, pass).min, scaleFor(it, pass).max) })));
    try {
      mod.score(fill((_, max) => max));
      mod.score(fill((min) => min));
      record({ suite: "scoring", id: `${def.key}:extremes`, ok: true });
    } catch (err) {
      record({ suite: "scoring", id: `${def.key}:extremes`, ok: false, detail: String(err) });
    }
  }
}

// ---------------------------------------------------------------- synthetic couples
type Couple = { id: string; description: string; has_children: boolean; a: Record<string, Response[]>; b: Record<string, Response[]>; expected: unknown };

async function loadCouples(): Promise<Couple[]> {
  const dir = path.join("evals", "synthetic_couples", "couples");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Couple);
}

async function runSyntheticCouples() {
  const couples = await loadCouples();
  if (couples.length === 0) {
    record({ suite: "synthetic_couples", id: "fixtures", ok: false, detail: "no couples found under evals/synthetic_couples/couples" });
    return;
  }
  let compare: ((c: Couple, out: ReturnType<typeof runStage1>) => string[]) | null = null;
  try {
    const mod = (await import("@/evals/synthetic_couples/index")) as { compareToExpected?: (c: Couple, out: ReturnType<typeof runStage1>) => string[] };
    compare = mod.compareToExpected ?? null;
  } catch {
    compare = null;
  }
  if (!compare) {
    record({ suite: "synthetic_couples", id: "comparator", ok: false, detail: "evals/synthetic_couples/index.ts does not export compareToExpected" });
    return;
  }
  for (const c of couples) {
    try {
      const out = runStage1({ hasChildren: c.has_children, a: c.a, b: c.b });
      const diffs = compare(c, out);
      record({ suite: "synthetic_couples", id: c.id, ok: diffs.length === 0, detail: diffs.slice(0, 5).join(" | ") });
    } catch (err) {
      record({ suite: "synthetic_couples", id: c.id, ok: false, detail: String(err) });
    }
  }
}

// ---------------------------------------------------------------- interpreter
const MH: readonly string[] = MENTAL_HEALTH_KEYS;

function interpreterChecks(id: string, output: InterpreterOutput, input: InterpreterInput, maskedSides: Array<"a" | "b">, maskedNumbers: number[]) {
  const { problems, warnings } = interpreterFindings({ output, input, maskedSides, maskedNumbers });
  record({ suite: "interpreter", id, ok: problems.length === 0, detail: [...problems, ...warnings.map((w) => `warn: ${w}`)].join("; ") });
  if (dumpDir) fs.writeFileSync(path.join(dumpDir, `${id.replace(/[^a-z0-9_-]/gi, "_")}.json`), JSON.stringify({ input, output, maskedSides }, null, 2));
}

async function runInterpreter() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "interpreter", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const couples = await loadCouples();
  if (couples.length === 0) {
    record({ suite: "interpreter", id: "fixtures", ok: false, detail: "no synthetic couples" });
    return;
  }
  const items: Array<BatchItem<InterpreterOutput> & { maskedSides: Array<"a" | "b">; maskedNumbers: number[] }> = [];
  for (const [i, c] of couples.entries()) {
    const stage1 = runStage1({ hasChildren: c.has_children, a: c.a, b: c.b });
    // Alternate consent so both masked and consented paths are exercised.
    const consentA = i % 2 === 0;
    const consentB = i % 3 === 0;
    const input = buildInterpreterInput(stage1, { a: c.a, b: c.b }, { a: { share_mental_health_scores: consentA }, b: { share_mental_health_scores: consentB } });
    const maskedSides: Array<"a" | "b"> = [];
    const maskedNumbers: number[] = [];
    if (!consentA) {
      maskedSides.push("a");
      maskedNumbers.push(...stage1.scores.a.filter((s) => MH.includes(s.instrument_key)).map((s) => s.value));
    }
    if (!consentB) {
      maskedSides.push("b");
      maskedNumbers.push(...stage1.scores.b.filter((s) => MH.includes(s.instrument_key)).map((s) => s.value));
    }
    items.push({ custom_id: `interp:${c.id}`, role: "interpreter", input, schema: interpreterOutputSchemaFor(input), ctx: { coupleId: null, jobStep: `eval:${c.id}` }, maskedSides, maskedNumbers });
  }
  let outputs: Map<string, InterpreterOutput>;
  if (process.env.LLM_USE_BATCH !== "0" && LLM_CONFIG.interpreter.batchable) {
    try {
      let batch_id = resumeBatchId ?? "";
      if (batch_id) console.log(`interpreter batch ${batch_id} resumed (${items.length} requests expected); polling…`);
      else {
        batch_id = (await submitBatch(items)).batch_id;
        if (batch_id) console.log(`interpreter batch ${batch_id} submitted (${items.length} requests); polling…`);
      }
      if (batch_id) await waitForBatch(batch_id);
      outputs = await withRetry(`collect ${batch_id}`, () => collectBatch(batch_id, items));
    } catch (err) {
      record({ suite: "interpreter", id: "batch", ok: false, detail: String(err).slice(0, 300) });
      return;
    }
  } else {
    outputs = new Map();
    for (const it of items) {
      try {
        outputs.set(it.custom_id, await withRetry(`interpreter ${it.custom_id}`, () => callRole("interpreter", it.input, it.schema, it.ctx)));
      } catch (err) {
        record({ suite: "interpreter", id: it.custom_id, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
      }
    }
  }
  for (const it of items) {
    const out = outputs.get(it.custom_id);
    if (!out) {
      if (!checks.some((c) => c.suite === "interpreter" && c.id === it.custom_id)) record({ suite: "interpreter", id: it.custom_id, ok: false, detail: "no output" });
      continue;
    }
    interpreterChecks(it.custom_id, out, it.input as InterpreterInput, it.maskedSides, it.maskedNumbers);
  }
}

/**
 * Retry transient failures (network drops, 5xx, 429) with capped exponential backoff so a laptop
 * sleeping or a Wi-Fi blip does not throw away a paid batch. Validation errors are not retried.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 8): Promise<T> {
  let delay = 5_000;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err);
      const transient = /Connection error|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|timed out|\b(429|500|502|503|504|529)\b|overloaded/i.test(msg);
      if (!transient || i >= attempts || err instanceof LlmValidationError) throw err;
      console.log(`  ${label}: transient error (${msg.slice(0, 80)}); retry ${i}/${attempts - 1} in ${Math.round(delay / 1000)}s`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 120_000);
    }
  }
}

async function waitForBatch(batchId: string) {
  const started = Date.now();
  for (;;) {
    const status = await withRetry(`status ${batchId}`, () => batchStatus(batchId));
    if (status === "ended") return;
    if (Date.now() - started > 24 * 60 * 60 * 1000) throw new Error(`batch ${batchId} did not end within 24h`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

// ---------------------------------------------------------------- prober
async function runProber() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "prober", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "prober", "cases.json"), "utf8")) as {
    cases: Array<{ id: string; domain: string; planted: Array<{ description: string; must_reference_any_of: string[] }>; expect_zero: boolean; input: unknown }>;
  };
  for (const c of cases.cases) {
    let out: ProberOutput;
    try {
      out = await withRetry(`prober ${c.id}`, () => callRole("prober", c.input, ProberOutputSchema, { coupleId: null, jobStep: `eval:prober:${c.id}` }));
    } catch (err) {
      record({ suite: "prober", id: c.id, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
      continue;
    }
    if (dumpDir) fs.writeFileSync(path.join(dumpDir, `prober_${c.id}.json`), JSON.stringify({ input: c.input, output: out }, null, 2));
    const problems: string[] = [];
    if (c.expect_zero && out.probes.length > 0) problems.push(`invented ${out.probes.length} probe(s) on a clean set`);
    for (const p of c.planted) {
      const hit = out.probes.some((probe) => probe.references.some((r) => p.must_reference_any_of.some((id) => r === id || r.includes(id))));
      if (!hit) problems.push(`missed planted contradiction: ${p.description}`);
    }
    if (out.probes.length > 3) problems.push("more than three probes");
    const guard = checkOutputDeterministic(out, { skipPaths: /\.references\[/ });
    if (!guard.ok) problems.push(`prohibited: ${guard.violations.map((v) => v.match).join(",")}`);
    record({ suite: "prober", id: c.id, ok: problems.length === 0, detail: problems.join("; ") || `${out.probes.length} probe(s)` });
  }
}

// ---------------------------------------------------------------- sentiment flagger
async function runSentiment() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "sentiment", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "sentiment", "cases.json"), "utf8")) as {
    cases: Array<{ id: string; expected_markers: string[]; forbidden_markers: string[]; input: unknown }>;
  };
  for (const c of cases.cases) {
    try {
      const out = await withRetry(`sentiment ${c.id}`, () => callRole("sentiment_flagger", c.input, SentimentFlaggerOutputSchema, { coupleId: null, jobStep: `eval:sentiment:${c.id}` }));
      const confident: string[] = out.flags.filter((f) => f.confidence >= 0.5).map((f) => f.marker);
      const problems: string[] = [];
      for (const m of c.expected_markers) if (!confident.includes(m)) problems.push(`missed ${m}`);
      for (const m of c.forbidden_markers) if (confident.includes(m)) problems.push(`false ${m}`);
      record({ suite: "sentiment", id: c.id, ok: problems.length === 0, detail: problems.join("; ") || `${out.flags.length} flag(s)` });
    } catch (err) {
      record({ suite: "sentiment", id: c.id, ok: false, detail: String(err) });
    }
  }
}

// ---------------------------------------------------------------- biographer and one-notch-ahead avatar
const ADVICE = /\b(you should|you need to|you ought to|you must|you have to|my advice|i('d| would) (suggest|recommend)|try to )\b/i;
/** Declining to advise ("I can't tell you what you should do") is the opposite of advising. */
const stripRefusals = (t: string) => t.replace(/\b(can't|cannot|can not|won't|will not|am not able to|not going to|not my place to)\b[^.?!]{0,80}/gi, " ");

type BiographerExpect = {
  kinds?: string[];
  not_kinds?: string[];
  references_all?: string[];
  suggest_stopping?: boolean;
  no_verdict?: boolean;
  min_options?: number;
  max_options?: number;
  min_threads?: number;
  aim_in?: string[];
  aim_not?: string[];
  max_question_words?: number;
  no_length_remark?: boolean;
  /** Two groups of words from two statements; the turn must not bring both up, under any `kind`. */
  not_together?: [string[], string[]];
  /** Words the question itself must leave alone for now. */
  question_avoids?: string[];
};
type BiographerFixture = { turns: Array<{ id: string; role: "guide" | "person"; text: string }>; depth?: "light" | "deeper"; threads_to_return_to?: string[] } & Record<string, unknown>;
type BiographerCase = { id: string; expect: BiographerExpect; input: BiographerFixture };
const LENGTH_REMARK = /\b(short|brief|long|lengthy|detailed) (answers?|repl(y|ies)|responses?)\b|\bfew words\b|\bman of few\b|\bkeep(ing)? it (short|brief)\b/i;

/** Fixtures carry the conversation; the computed fields are filled in the same way the app fills them. */
function completeBiographerInput(input: BiographerFixture) {
  return { ...input, depth: input.depth ?? "light", answer_profile: answerProfile(input.turns), threads_to_return_to: input.threads_to_return_to ?? [] };
}
type MentorCase = { id: string; expect: { unsure?: boolean; draws_on_any?: string[]; draws_on_all?: string[]; no_verdict?: boolean }; input: unknown };

async function runBiographer() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "biographer", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "biographer", "cases.json"), "utf8")) as { cases: BiographerCase[] };
  for (const c of cases.cases) {
    try {
      const input = completeBiographerInput(c.input);
      const raw = await withRetry(`biographer ${c.id}`, () => callRole("biographer", input, biographerTurnSchemaFor({ answers: input.answer_profile.answers, depth: input.depth }), { coupleId: null, jobStep: `eval:biographer:${c.id}` }));
      // Checked as the person would see it: the app only shows places to start to people who answer briefly.
      const out = { ...raw, options: optionsFor(input.answer_profile, raw.options) };
      if (dumpDir) fs.writeFileSync(path.join(dumpDir, `biographer_${c.id}.json`), JSON.stringify({ input, output: out }, null, 2));
      const problems: string[] = [];
      const marks = (out.question.match(/\?/g) ?? []).length;
      // "Tell me about the tin." is an ask; the prompt prefers it to "how do you feel about".
      if (marks < 1 && !/^(tell me|describe|walk me through|take me (back )?to)\b/i.test(out.question.trim())) problems.push("no question asked");
      if (marks > 2) problems.push(`${marks} questions in one turn`);
      if (ADVICE.test(stripRefusals(`${out.reflection} ${out.question}`))) problems.push("gives advice");
      if (c.expect.kinds && !c.expect.kinds.includes(out.kind)) problems.push(`kind ${out.kind}, expected ${c.expect.kinds.join(" or ")}`);
      if (c.expect.not_kinds?.includes(out.kind)) problems.push(`kind ${out.kind} is too early or out of place here`);
      for (const r of c.expect.references_all ?? []) if (!out.references.includes(r)) problems.push(`does not cite ${r}`);
      if (c.expect.min_options !== undefined && out.options.length < c.expect.min_options) problems.push(`${out.options.length} option(s), expected at least ${c.expect.min_options}`);
      if (c.expect.max_options !== undefined && out.options.length > c.expect.max_options) problems.push(`${out.options.length} option(s), expected at most ${c.expect.max_options}`);
      if (c.expect.min_threads !== undefined && out.threads.length < c.expect.min_threads) problems.push(`${out.threads.length} thread(s) kept, expected at least ${c.expect.min_threads}`);
      if (c.expect.aim_in && !c.expect.aim_in.includes(out.aim)) problems.push(`aim ${out.aim}, expected ${c.expect.aim_in.join(" or ")}`);
      if (c.expect.aim_not?.includes(out.aim)) problems.push(`aim ${out.aim}: asks again for what was declined, or goes past the depth chosen`);
      const questionWords = out.question.trim().split(/\s+/).length;
      if (c.expect.max_question_words !== undefined && questionWords > c.expect.max_question_words) problems.push(`question is ${questionWords} words, expected at most ${c.expect.max_question_words}`);
      if (c.expect.no_length_remark && LENGTH_REMARK.test(`${out.reflection} ${out.question}`)) problems.push("remarks on how much the person writes");
      const avoided = (c.expect.question_avoids ?? []).filter((w) => out.question.toLowerCase().includes(w.toLowerCase()));
      if (avoided.length) problems.push(`the question goes straight to: ${avoided.join(", ")}`);
      if (c.expect.not_together) {
        const said = `${out.reflection} ${out.question}`.toLowerCase();
        if (c.expect.not_together.every((group) => group.some((w) => said.includes(w.toLowerCase())))) problems.push("sets two of their statements side by side without calling it a discrepancy");
      }
      if (out.options.some((o) => !/^(i|i'|i\u2019|we|my|me)\b/i.test(o.trim()))) problems.push(`an option is not a first-person behaviour: ${out.options.join(" | ")}`);
      if (c.expect.suggest_stopping !== undefined && out.suggest_stopping !== c.expect.suggest_stopping) problems.push(`suggest_stopping ${out.suggest_stopping}`);
      record({ suite: "biographer", id: c.id, ok: problems.length === 0, detail: problems.join("; ") || `${out.kind}/${out.aim}, ${out.options.length} option(s), ${out.threads.length} thread(s)` });
    } catch (err) {
      record({ suite: "biographer", id: c.id, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
    }
  }
}

async function runMentor() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "mentor", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "mentor", "cases.json"), "utf8")) as { cases: MentorCase[] };
  for (const c of cases.cases) {
    try {
      const out = await withRetry(`mentor ${c.id}`, () => callRole("mentor", c.input, MentorReplySchema, { coupleId: null, jobStep: `eval:mentor:${c.id}` }));
      if (dumpDir) fs.writeFileSync(path.join(dumpDir, `mentor_${c.id}.json`), JSON.stringify({ input: c.input, output: out }, null, 2));
      const problems: string[] = [];
      if (!/\b(I|I'm|I've|I'd|my|me)\b/.test(out.reply)) problems.push("not in the first person");
      if (ADVICE.test(stripRefusals(out.reply))) problems.push("instructs the person");
      if (c.expect.unsure && out.question_for_biographer && /\b(does|did|is|has) (he|she|they|ana|ben)\b/i.test(out.question_for_biographer)) problems.push("hand-off question is about the person, not to them");
      if (c.expect.unsure !== undefined && out.unsure !== c.expect.unsure) problems.push(`unsure ${out.unsure}, expected ${c.expect.unsure}`);
      if (c.expect.draws_on_any && !c.expect.draws_on_any.some((id) => out.draws_on.includes(id))) problems.push("draws on none of their lines");
      for (const id of c.expect.draws_on_all ?? []) if (!out.draws_on.includes(id)) problems.push(`does not draw on ${id}`);
      record({ suite: "mentor", id: c.id, ok: problems.length === 0, detail: problems.join("; ") || (out.unsure ? "unsure" : `${out.draws_on.length} line(s)`) });
    } catch (err) {
      record({ suite: "mentor", id: c.id, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
    }
  }
}

// ---------------------------------------------------------------- dry run (no API key needed)
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function runDryRun() {
  const outDir = path.join("evals", "results", "dry-run");
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name: string, req: unknown) => {
    const json = JSON.stringify(req, null, 2);
    fs.writeFileSync(path.join(outDir, `${name}.json`), json);
    return approxTokens(json);
  };
  const couples = await loadCouples();
  let n = 0;
  for (const [i, c] of couples.entries()) {
    const stage1 = runStage1({ hasChildren: c.has_children, a: c.a, b: c.b });
    const input = buildInterpreterInput(stage1, { a: c.a, b: c.b }, { a: { share_mental_health_scores: i % 2 === 0 }, b: { share_mental_health_scores: i % 3 === 0 } });
    const req = buildRequest("interpreter", input, InterpreterOutputSchema);
    const tokens = write(`interpreter-${c.id}`, req);
    const text = JSON.stringify(req);
    const leaked = /"text":\s*"TODO: populate from source"/.test(text) || /Not at all|Several days/.test(text);
    record({ suite: "dry_run", id: `interpreter:${c.id}`, ok: !leaked, detail: leaked ? "instrument item text leaked into the prompt" : `~${tokens} tokens` });
    n++;
  }
  const prober = JSON.parse(fs.readFileSync(path.join("evals", "prober", "cases.json"), "utf8")) as { cases: Array<{ id: string; input: unknown }> };
  for (const c of prober.cases) {
    const req = buildRequest("prober", c.input, ProberOutputSchema);
    const tokens = write(`prober-${c.id}`, req);
    const ok = req.model === LLM_CONFIG.prober.model && req.tool_choice?.type === "auto" && Array.isArray((req as { fallbacks?: unknown }).fallbacks);
    record({ suite: "dry_run", id: `prober:${c.id}`, ok, detail: ok ? `~${tokens} tokens` : "unexpected request shape for Claude Fable 5.1" });
    n++;
  }
  const sentiment = JSON.parse(fs.readFileSync(path.join("evals", "sentiment", "cases.json"), "utf8")) as { cases: Array<{ id: string; input: unknown }> };
  for (const c of sentiment.cases) {
    const req = buildRequest("sentiment_flagger", c.input, SentimentFlaggerOutputSchema);
    const tokens = write(`sentiment-${c.id}`, req);
    record({ suite: "dry_run", id: `sentiment:${c.id}`, ok: true, detail: `~${tokens} tokens` });
    n++;
  }
  for (const [role, file, schema] of [
    ["biographer", path.join("evals", "biographer", "cases.json"), BiographerTurnSchema],
    ["mentor", path.join("evals", "mentor", "cases.json"), MentorReplySchema],
  ] as const) {
    const set = JSON.parse(fs.readFileSync(file, "utf8")) as { cases: Array<{ id: string; input: unknown }> };
    for (const c of set.cases) {
      const req = buildRequest(role, role === "biographer" ? completeBiographerInput(c.input as BiographerFixture) : c.input, schema as ZodType<unknown>);
      const tokens = write(`${role}-${c.id}`, req);
      record({ suite: "dry_run", id: `${role}:${c.id}`, ok: req.tool_choice?.type === "tool", detail: `~${tokens} tokens` });
      n++;
    }
  }
  console.log(`dry run wrote ${n} request(s) to ${outDir}`);
}

// ---------------------------------------------------------------- main
function callBreakdown() {
  const out: Record<string, { calls: number; outcomes: Record<string, number>; usd: number }> = {};
  for (const r of recorder.records) {
    const row = (out[r.role] ??= { calls: 0, outcomes: {}, usd: 0 });
    row.calls++;
    row.outcomes[r.outcome] = (row.outcomes[r.outcome] ?? 0) + 1;
    // List price; batch requests are billed at half of this.
    row.usd = Math.round((row.usd + costOfRecord(r) * (r.batch_id ? 0.5 : 1)) * 1e4) / 1e4;
  }
  return out;
}

async function main() {
  // Synthetic data only, so rejection reasons are safe to print here (never in jobs or the app).
  configureLlm({
    recorder,
    memo: new MemoryMemo(),
    onRejected: (role, kind, problem, ctx) => console.log(`  retry  ${role} ${ctx.jobStep}: ${kind}: ${problem.split(". Never state")[0].slice(0, 400)}`),
  });
  if (dumpDir) fs.mkdirSync(dumpDir, { recursive: true });
  console.log(`evals: suite=${suite} llm_config=${LLM_CONFIG_VERSION}`);
  if (dryRun) {
    await runDryRun();
  }
  if (suite === "all" || suite === "scoring") runScoring();
  if (suite === "all" || suite === "synthetic_couples") await runSyntheticCouples();
  if (!dryRun && (suite === "all" || suite === "interpreter")) await runInterpreter();
  if (!dryRun && (suite === "all" || suite === "prober")) await runProber();
  if (suite === "sentiment") await runSentiment();
  if (!dryRun && (suite === "all" || suite === "biographer")) await runBiographer();
  if (!dryRun && (suite === "all" || suite === "mentor")) await runMentor();
  const failed = checks.filter((c) => !c.ok);
  const summary = {
    llm_config_version: LLM_CONFIG_VERSION,
    ran_at: new Date().toISOString(),
    total: checks.length,
    failed: failed.length,
    llm_calls: recorder.records.length,
    llm_calls_by_role: callBreakdown(),
    checks,
  };
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; ${recorder.records.length} model call(s) ${JSON.stringify(callBreakdown())}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
