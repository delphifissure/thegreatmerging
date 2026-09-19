/**
 * Eval harness (section 10). Usage:
 *   pnpm evals                       run every suite
 *   pnpm evals --suite scoring       scoring | synthetic_couples | interpreter | prober | biographer | mentor | panel | guardrail | replay | sandbox
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
 *   panel              several versions of one person answer one situation: each holds settled lines, says when
 *                      it does not know, and never talks about being a version; the reader reports a difference
 *                      only when it is bigger than two runs of the same version
 *   guardrail          the model half of the language guardrail: catches verdicts, diagnoses and trait labels,
 *                      lets behaviour, passing states, first-person feeling and questions through
 *   replay             two rehearsal avatars replay a remembered argument turn by turn: each holds its settled
 *                      lines, never says a line it may only act on, never talks about being an avatar, and the
 *                      pair do not make peace at once; the move coder labels single turns
 *   sandbox            the persona writer invents two people and a shared history without clinical or trait
 *                      vocabulary; two sandbox avatars talk, and neither knows what is only in the other's notes
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
import { AvatarBriefSchema, BiographerTurnSchema, GuardrailOutputSchema, InterpreterOutputSchema, MoveCodeSchema, RehearsalTurnSchema, SandboxTurnSchema, MentorReplySchema, PanelReadingSchema, ProberOutputSchema, SentimentFlaggerOutputSchema, VersionReplySchema, type InterpreterOutput, type ProberOutput, type VersionReply } from "@/lib/llm/schemas";
import { buildRequest, callRole, costOfRecord, collectBatch, batchStatus, submitBatch, configureLlm, MemoryMemo, MemoryRecorder, LlmValidationError, type BatchItem } from "@/lib/llm";
import { checkOutputDeterministic } from "@/lib/guardrails";
import { answerProfile, biographerTurnSchemaFor, optionsFor } from "@/lib/biographer/inputs";
import { buildVersionInput, panelReadingSchemaFor, panelVersionsFor, type PanelVersion } from "@/lib/biographer/versions";
import { buildVoiceInput, EMPTY_VOICE, registersFor, type VoiceSample } from "@/lib/biographer/voice";
import { buildMoveCoderInput, buildRehearsalInput, cleanSpeech, nextSpeaker, replayIsOver, type Frame } from "@/lib/replay/inputs";
import { endingOf, recognition, resolvedTooEasily, type CodedTurn, type Move } from "@/lib/replay/moves";
import { buildBriefWriterInput, buildSandboxAvatarInput, nextSide, sandboxIsOver, ScenarioSchema, type SandboxTurn } from "@/lib/sandbox/scenario";
import { pickNames, surpriseSeed } from "@/lib/sandbox/names";
import { generatePersonas } from "@/lib/sandbox/generate";
import { randomInt } from "node:crypto";
import type { DocumentEntry } from "@/lib/data/biographer";
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
// "Try to picture one Sunday" is an interviewer's prompt and "I try to…" is a person describing themselves; neither is advice.
const ADVICE = /\b(you should|you need to|you ought to|you must|you have to|my advice|i('d| would) (suggest|recommend)|you (could|might) (want to )?try)\b/i;
/** Declining to advise ("I can't tell you what you should do") is the opposite of advising. */
const stripRefusals = (t: string) => t.replace(/\b(can't|cannot|can not|won't|will not|not able to|not going to|not my place to)\b[^.?!]{0,80}/gi, " ");

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
type MentorCase = {
  id: string;
  expect: { unsure?: boolean; draws_on_any?: string[]; draws_on_all?: string[]; no_verdict?: boolean; max_mean_sentence_words?: number; min_mean_sentence_words?: number; must_not_mention?: string[]; shorter_sentences_than?: { case: string; by: number } };
  input: Record<string, unknown>;
};
/** A blunt measure of manner that is easy to read off a reply: how long its sentences run. */
function meanSentenceWords(text: string) {
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/).filter((s) => /[a-z]/i.test(s));
  return sentences.length ? sentences.reduce((n, s) => n + s.trim().split(/\s+/).length, 0) / sentences.length : 0;
}

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
      // A place to start is a few of the person's own words: never a question back at them, never about "you".
      if (out.options.some((o) => o.trim().endsWith("?") || /\byou(r|'re)?\b/i.test(o) || o.trim().split(/\s+/).length > 12)) problems.push(`an option is not something the person could say: ${out.options.join(" | ")}`);
      if (c.expect.suggest_stopping !== undefined && out.suggest_stopping !== c.expect.suggest_stopping) problems.push(`suggest_stopping ${out.suggest_stopping}`);
      record({ suite: "biographer", id: c.id, ok: problems.length === 0, detail: problems.join("; ") || `${out.kind}/${out.aim}, ${out.options.length} option(s), ${out.threads.length} thread(s)` });
    } catch (err) {
      record({ suite: "biographer", id: c.id, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
    }
  }
}

// ---------------------------------------------------------------- the guardrail's model check
async function runGuardrail() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "guardrail", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "guardrail", "cases.json"), "utf8")) as Record<"flag" | "pass", Array<{ id: string; text: string }>>;
  for (const [want, list] of [
    [true, cases.flag],
    [false, cases.pass],
  ] as const) {
    for (const c of list) {
      try {
        const out = await withRetry(`guardrail ${c.id}`, () => callRole("guardrail", { text: c.text }, GuardrailOutputSchema, { coupleId: null, jobStep: `eval:guardrail:${c.id}` }));
        const ok = out.contains_verdict_or_diagnosis === want;
        record({ suite: "guardrail", id: `${want ? "flag" : "pass"}/${c.id}`, ok, detail: ok ? (want ? "caught" : "let through") : `${want ? "missed" : "wrongly flagged"}: ${out.reason.slice(0, 160)}` });
      } catch (err) {
        record({ suite: "guardrail", id: c.id, ok: false, detail: String(err).slice(0, 200) });
      }
    }
  }
}

// ---------------------------------------------------------------- replay of a remembered argument
type ReplayPerson = { key: "proposer" | "partner"; name: string; state_before: string; remembered: { mine: Move[]; theirs: Move[]; ending: string }; must_not_say: string[]; voice_samples?: VoiceSample[]; entries: Array<{ document: "history" | "constitution"; section: string; text: string; tier: "private" | "avatar_only" | "shareable"; mark: "settled" | "open" }> };
type ReplayCases = { coder: Array<{ id: string; expect: Move[]; input: unknown }>; replays: Array<{ id: string; max_turns: number; frame: Frame; people: [ReplayPerson, ReplayPerson]; coaching?: { person: "proposer" | "partner"; from_seq: number; note: string; expect_moves: Move[]; max_words: number; turns: number } }> };
const ABOUT_BEING_SIMULATED = /\b(avatar|simulat|role-?play|as an ai|language model|test run|rehears)/i;

async function runReplay() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "replay", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "replay", "cases.json"), "utf8")) as ReplayCases;
  for (const c of cases.coder) {
    try {
      const out = await withRetry(`move_coder ${c.id}`, () => callRole("move_coder", c.input, MoveCodeSchema, { coupleId: null, jobStep: `eval:replay:coder:${c.id}` }));
      record({ suite: "replay", id: `coder/${c.id}`, ok: c.expect.includes(out.move), detail: `${out.move}${out.secondary ? ` + ${out.secondary}` : ""}${c.expect.includes(out.move) ? "" : `, expected ${c.expect.join(" or ")}`}` });
    } catch (err) {
      record({ suite: "replay", id: `coder/${c.id}`, ok: false, detail: String(err).slice(0, 200) });
    }
  }

  for (const r of cases.replays) {
    const people = Object.fromEntries(r.people.map((p) => [p.key, p])) as Record<"proposer" | "partner", ReplayPerson>;
    const first = r.frame.firstSpeaker;
    const order: [string, string] = [first, first === "proposer" ? "partner" : "proposer"];
    const entriesOf = (p: ReplayPerson): DocumentEntry[] => p.entries.map((e, i) => ({ id: `${p.key}-${i + 1}`, document: e.document, section: e.section, text: e.text, status: "ratified", mark: e.mark, tier: e.tier, in_their_words: true, source_thread_id: null, source_turns: [], ratified_at: null, created_at: new Date(0) }));
    const spoken: Array<{ speakerId: string; says: string | null; does: string | null; ends: boolean }> = [{ speakerId: first, says: r.frame.openingLine, does: null, ends: false }];
    const coded: CodedTurn[] = [];
    const log: unknown[] = [];
    let failed = false;
    try {
      const opening = await callRole("move_coder", buildMoveCoderInput(spoken, first), MoveCodeSchema, { coupleId: null, jobStep: `eval:replay:${r.id}:code:1` });
      coded.push({ speaker: first, move: opening.move, secondary: opening.secondary, remembered: true });
      while (!replayIsOver(spoken, r.max_turns)) {
        const key = nextSpeaker(spoken, order) as "proposer" | "partner";
        const me = people[key];
        const other = people[key === "proposer" ? "partner" : "proposer"];
        const built = buildRehearsalInput({ me: { id: key, name: me.name }, partnerName: other.name, entries: entriesOf(me), voice: buildVoiceInput({ samples: me.voice_samples ?? [], corrections: [], registers: registersFor("rehearsal") }), frame: r.frame, stateBefore: me.state_before, turns: spoken, maxTurns: r.max_turns });
        const seq = spoken.length + 1;
        const out = await withRetry(`replay ${r.id} turn ${seq}`, () => callRole("rehearsal", built.input, RehearsalTurnSchema, { coupleId: null, jobStep: `eval:replay:${r.id}:turn:${seq}` }));
        const turn = { speakerId: key, says: cleanSpeech(out.says), does: out.does?.trim() || null, ends: out.ends };
        spoken.push(turn);
        const code = await callRole("move_coder", buildMoveCoderInput(spoken, first), MoveCodeSchema, { coupleId: null, jobStep: `eval:replay:${r.id}:code:${seq}` });
        coded.push({ speaker: key, move: code.move, secondary: code.secondary });
        log.push({ seq, who: me.name, move: code.move, ...out });

        const said = `${turn.says ?? ""} ${turn.does ?? ""}`;
        const problems: string[] = [];
        if (ABOUT_BEING_SIMULATED.test(said)) problems.push("talks about being an avatar or a simulation");
        if ((turn.says ?? "").split(/\s+/).filter(Boolean).length > 70) problems.push("a turn in an argument should be short");
        for (const pattern of me.must_not_say) if (new RegExp(pattern, "i").test(turn.says ?? "")) problems.push(`gives up a settled line, or says a line it may only act on: /${pattern.slice(0, 36)}…/`);
        record({ suite: "replay", id: `${r.id}/turn ${seq} ${me.name}`, ok: problems.length === 0, detail: problems.join("; ") || `${code.move}: ${(turn.says ?? turn.does ?? "").slice(0, 80)}` });
      }
    } catch (err) {
      failed = true;
      record({ suite: "replay", id: `${r.id}/run`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 220)}` : String(err).slice(0, 220) });
    }
    if (dumpDir) fs.writeFileSync(path.join(dumpDir, `replay_${r.id}.json`), JSON.stringify({ frame: r.frame, turns: log }, null, 2));
    if (failed) continue;
    record({ suite: "replay", id: `${r.id}/does not make peace at once`, ok: !resolvedTooEasily(coded), detail: coded.map((t) => t.move).join(" > ") });
    for (const p of r.people) {
      const otherKey = p.key === "proposer" ? "partner" : "proposer";
      const [own, partner] = [recognition(p.remembered.mine, coded, p.key), recognition(p.remembered.theirs, coded, otherKey)];
      console.log(`  ${p.name}: own avatar ${own.matched.length} of ${own.matched.length + own.onlyRemembered.length + own.onlyAvatar.length} kinds of move in common (missing ${own.onlyRemembered.join(", ") || "none"}; extra ${own.onlyAvatar.join(", ") || "none"}); partner's avatar ${partner.matched.length} of ${partner.matched.length + partner.onlyRemembered.length + partner.onlyAvatar.length}`);
    }
    console.log(`  remembered ending ${r.people[0].remembered.ending}; the replay ended ${endingOf(coded)}`);

    // A coached retake: keep the turns before one of this person's, hand their avatar the note, and play on.
    if (r.coaching && spoken[r.coaching.from_seq - 1]?.speakerId === r.coaching.person) {
      const k = r.coaching;
      const retake = spoken.slice(0, k.from_seq - 1);
      try {
        for (let i = 0; i < k.turns && !replayIsOver(retake, r.max_turns); i++) {
          const key = nextSpeaker(retake, order) as "proposer" | "partner";
          const me = people[key];
          const other = people[key === "proposer" ? "partner" : "proposer"];
          const built = buildRehearsalInput({ me: { id: key, name: me.name }, partnerName: other.name, entries: entriesOf(me), voice: buildVoiceInput({ samples: me.voice_samples ?? [], corrections: [], registers: registersFor("rehearsal") }), frame: r.frame, stateBefore: me.state_before, coaching: key === k.person ? [k.note] : [], turns: retake, maxTurns: r.max_turns });
          const out = await withRetry(`replay ${r.id} retake turn ${retake.length + 1}`, () => callRole("rehearsal", built.input, RehearsalTurnSchema, { coupleId: null, jobStep: `eval:replay:${r.id}:retake:${retake.length + 1}` }));
          const turn = { speakerId: key, says: cleanSpeech(out.says), does: out.does?.trim() || null, ends: out.ends };
          retake.push(turn);
          if (i > 0) continue;
          const code = await callRole("move_coder", buildMoveCoderInput(retake, first), MoveCodeSchema, { coupleId: null, jobStep: `eval:replay:${r.id}:retake:code` });
          const words = (turn.says ?? "").split(/\s+/).filter(Boolean).length;
          const problems: string[] = [];
          if (![code.move, code.secondary].some((m) => m && k.expect_moves.includes(m))) problems.push(`coded ${code.move}, expected ${k.expect_moves.join(" or ")}`);
          if (words > k.max_words) problems.push(`${words} words; the note says they barely speak here`);
          if (/moments? like this|i don'?t explain anything/i.test(turn.says ?? "")) problems.push("recites the coaching instead of acting on it");
          record({ suite: "replay", id: `${r.id}/coached retake`, ok: problems.length === 0, detail: problems.join("; ") || `${code.move}: ${turn.says ?? ""} ${turn.does ? `(${turn.does})` : ""}`.slice(0, 140) });
        }
      } catch (err) {
        record({ suite: "replay", id: `${r.id}/coached retake`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 220)}` : String(err).slice(0, 220) });
      }
    }
  }
}

// ---------------------------------------------------------------- the two-avatar sandbox
type SandboxCases = {
  writer: Array<{ id: string; input: { seed: string; names: [string, string] | null }; expect: { names?: [string, string]; mentions_any?: string[]; must_not_match?: string[] } }>;
  conversations: Array<{ id: string; max_turns: number; secrets: Record<"a" | "b", string[]>; brief_must_mention?: Partial<Record<"a" | "b", string[]>>; brief_must_not_mention?: Partial<Record<"a" | "b", string[]>>; no_tidy_ending?: boolean; must_end?: boolean; scenario: unknown }>;
};
const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** The voice a language model falls into when two of them are left to argue: nobody in a kitchen at night talks like this. */
const THERAPY_SPEAK = /\b(i hear you|that must (be|have been)|thank you for (telling|sharing|trusting|being honest)|carrying (this|that|it|all of (this|that)) (alone|by yourself|on your own)|hold(ing)? space|i need you to let me|that['\u2019]?s a real thing|your feelings are valid|i['\u2019]?m not (even )?mad|whenever you['\u2019]?re ready|i appreciate you (telling|sharing)|let me (be|actually be) in this with you)\b/i;
const SOFT_MOVES = new Set<Move>(["appreciates", "agrees", "proposes", "owns"]);

async function runSandbox() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "sandbox", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "sandbox", "cases.json"), "utf8")) as SandboxCases;
  for (const c of cases.writer) {
    try {
      // As in the app: the names, and the outline when there is no seed, are drawn in code before the model is asked.
      const draw = (max: number) => randomInt(max);
      const names = pickNames({ typed: [c.input.names?.[0], c.input.names?.[1]], used: [], draw });
      const input = { seed: c.input.seed || surpriseSeed(draw), names };
      const out = await generatePersonas({ ...input, call: (role, payload, schema, step) => withRetry(`${role} ${c.id}`, () => callRole(role, payload, schema, { coupleId: null, jobStep: `eval:sandbox:writer:${c.id}:${step}` })) });
      if (dumpDir) fs.writeFileSync(path.join(dumpDir, `sandbox_writer_${c.id}.json`), JSON.stringify(out, null, 2));
      const all = `${out.a_notes}\n${out.b_notes}\n${out.shared_history}`;
      const problems: string[] = [];
      if (out.a_name.trim().toLowerCase() === out.b_name.trim().toLowerCase()) problems.push("both people have the same name");
      if (out.a_name !== names[0] || out.b_name !== names[1]) problems.push(`names ${out.a_name} and ${out.b_name}, was given ${names.join(" and ")}`);
      for (const [who, notes] of [[out.a_name, out.a_notes], [out.b_name, out.b_notes]] as const) if (wordCount(notes) < 180) problems.push(`${who}'s notes are only ${wordCount(notes)} words`);
      if (wordCount(out.shared_history) < 100) problems.push(`shared history is only ${wordCount(out.shared_history)} words`);
      if (!out.shared_history.includes(out.a_name) || !out.shared_history.includes(out.b_name)) problems.push("the shared history does not name both people");
      if (out.situations.length < 3) problems.push(`${out.situations.length} situation(s), asked for three`);
      if (c.expect.mentions_any && !c.expect.mentions_any.some((w) => all.toLowerCase().includes(w))) problems.push(`ignores the seed: none of ${c.expect.mentions_any.join(", ")}`);
      for (const pattern of c.expect.must_not_match ?? []) if (new RegExp(pattern, "i").test(all)) problems.push(`clinical or trait vocabulary: /${pattern.slice(0, 30)}…/`);
      if (!ScenarioSchema.safeParse({ a: { name: out.a_name, notes: out.a_notes }, b: { name: out.b_name, notes: out.b_notes }, shared: out.shared_history, situation: out.situations[0], firstSpeaker: "a" }).success) problems.push("what it wrote cannot be used as a scenario");
      record({ suite: "sandbox", id: `writer/${c.id}`, ok: problems.length === 0, detail: problems.join("; ") || `${out.a_name} (${wordCount(out.a_notes)} words) and ${out.b_name} (${wordCount(out.b_notes)} words)${c.input.seed ? "" : `, from: ${input.seed.slice(0, 110)}…`}` });
    } catch (err) {
      record({ suite: "sandbox", id: `writer/${c.id}`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 220)}` : String(err).slice(0, 220) });
    }
  }

  for (const c of cases.conversations) {
    const scenario = ScenarioSchema.parse(c.scenario);
    // Each person's brief: written to them, in the second person, without sight of the other's notes.
    const briefs = { a: "", b: "" };
    for (const side of ["a", "b"] as const) {
      const me = scenario[side];
      try {
        const out = await withRetry(`sandbox ${c.id} brief ${side}`, () => callRole("brief_writer", buildBriefWriterInput(scenario, side), AvatarBriefSchema, { coupleId: null, jobStep: `eval:sandbox:${c.id}:brief:${side}` }));
        briefs[side] = out.brief;
        if (dumpDir) fs.writeFileSync(path.join(dumpDir, `sandbox_${c.id}_brief_${side}.txt`), out.brief);
        const lower = out.brief.toLowerCase();
        const problems: string[] = [];
        const you = (out.brief.match(/\byou(r|rs|rself)?\b/gi) ?? []).length;
        const named = (out.brief.match(new RegExp(`\\b${me.name}\\b`, "g")) ?? []).length;
        if (you < 15) problems.push(`addresses them as "you" only ${you} times`);
        if (named > 2) problems.push(`names ${me.name} ${named} times: it is still written about them, not to them`);
        if (/\b(neither|both|the two) of them\b/i.test(out.brief)) problems.push('still says "of them" where it should say "of you"');
        if (!c.brief_must_mention && c.secrets[side].length && !c.secrets[side].some((w) => lower.includes(w))) problems.push("dropped the thing this person has never told their partner");
        const must = c.brief_must_mention?.[side];
        if (must && !must.some((w) => lower.includes(w))) problems.push(`dropped something this person knows: none of ${must.join(", ")}`);
        const mustNot = (c.brief_must_not_mention?.[side] ?? []).filter((w) => lower.includes(w));
        if (mustNot.length) problems.push(`tells this person what they could not know: ${mustNot.join(", ")}`);
        // "He deleted the voicemails; you don't know that" tells the avatar exactly what it is not supposed to know.
        if (/\byou (don['\u2019]?t|do not) know (that|about|this)\b|\bunknown to you\b|\bwhat you (haven['\u2019]?t|have not) been told\b|\bwithout (you|your) knowing\b/i.test(out.brief)) problems.push('says "you don\'t know that": an avatar that is told the plot knows the plot');
        const leaked = c.secrets[side === "a" ? "b" : "a"].filter((w) => lower.includes(w));
        if (leaked.length) problems.push(`contains what is only in the other person's notes: ${leaked.join(", ")}`);
        record({ suite: "sandbox", id: `${c.id}/brief for ${me.name}`, ok: problems.length === 0, detail: problems.join("; ") || `${wordCount(out.brief)} words, "you" ${you} times` });
      } catch (err) {
        record({ suite: "sandbox", id: `${c.id}/brief for ${me.name}`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 220)}` : String(err).slice(0, 220) });
      }
    }
    if (!briefs.a || !briefs.b) continue;
    const turns: SandboxTurn[] = [];
    const coded: CodedTurn[] = [];
    const log: unknown[] = [];
    try {
      while (!sandboxIsOver(turns, c.max_turns)) {
        const side = nextSide(scenario, turns);
        const out = await withRetry(`sandbox ${c.id} turn ${turns.length + 1}`, () => callRole("sandbox_avatar", buildSandboxAvatarInput(scenario, side, briefs[side], turns), SandboxTurnSchema, { coupleId: null, jobStep: `eval:sandbox:${c.id}:turn:${turns.length + 1}` }));
        const turn: SandboxTurn = { side, says: cleanSpeech(out.says), does: out.does?.trim() || null, ends: out.ends };
        turns.push(turn);
        const code = await callRole("move_coder", buildMoveCoderInput(turns.map((t) => ({ speakerId: t.side, says: t.says, does: t.does })), scenario.firstSpeaker), MoveCodeSchema, { coupleId: null, jobStep: `eval:sandbox:${c.id}:code:${turns.length}` });
        coded.push({ speaker: side, move: code.move, secondary: code.secondary });
        log.push({ who: scenario[side].name, move: code.move, ...out });
        const said = `${turn.says ?? ""} ${turn.does ?? ""}`.toLowerCase();
        const problems: string[] = [];
        if (ABOUT_BEING_SIMULATED.test(said)) problems.push("talks about being an avatar or a simulation");
        if (wordCount(turn.says ?? "") > 70) problems.push("a turn should be short");
        // What is only in the other person's notes is something this avatar was never told.
        // A secret is only leaked if this avatar says it before its owner has said it out loud.
        const spokenByOwner = turns.slice(0, -1).filter((t) => t.side !== side).map((t) => `${t.says ?? ""} ${t.does ?? ""}`.toLowerCase()).join(" ");
        const leaked = c.secrets[side === "a" ? "b" : "a"].filter((w) => said.includes(w) && !spokenByOwner.includes(w));
        if (leaked.length) problems.push(`knows what is only in the other person's notes: ${leaked.join(", ")}`);
        if (THERAPY_SPEAK.test(turn.says ?? "")) problems.push(`talks like a therapist: "${THERAPY_SPEAK.exec(turn.says ?? "")?.[0]}"`);
        record({ suite: "sandbox", id: `${c.id}/turn ${turns.length} ${scenario[side].name}`, ok: problems.length === 0, detail: problems.join("; ") || `${code.move}: ${(turn.says ?? turn.does ?? "").slice(0, 90)}` });
      }
      if (dumpDir) fs.writeFileSync(path.join(dumpDir, `sandbox_${c.id}.json`), JSON.stringify(log, null, 2));
      record({ suite: "sandbox", id: `${c.id}/does not make peace at once`, ok: !resolvedTooEasily(coded), detail: coded.map((t) => t.move).join(" > ") });
      if (c.no_tidy_ending) {
        const tail = coded.slice(-4);
        const tidy = tail.length === 4 && tail.every((t) => SOFT_MOVES.has(t.move));
        record({ suite: "sandbox", id: `${c.id}/does not end in a hug and a plan`, ok: !tidy, detail: tail.map((t) => t.move).join(" > ") });
      }
      // Nobody sets a number of turns any more, so one of them has to end it.
      const endedItself = turns[turns.length - 1]?.ends === true || turns.slice(-2).every((t) => !t.says?.trim());
      // A powder keg can run long; only the quiet scene is required to stop inside the eval's own cap.
      if (c.must_end) record({ suite: "sandbox", id: `${c.id}/ends by itself`, ok: endedItself && turns.length >= 4, detail: endedItself ? `${scenario[turns[turns.length - 1].side].name} ended it after ${turns.length} turns` : `still going at the cap of ${c.max_turns}` });
    } catch (err) {
      record({ suite: "sandbox", id: `${c.id}/run`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 220)}` : String(err).slice(0, 220) });
    }
  }
}

// ---------------------------------------------------------------- the solo panel
type PanelFixture = {
  id: string;
  person_name: string;
  situation: string;
  entries: Array<{ document: "history" | "constitution"; section: string; text: string; mark: "settled" | "open" }>;
  expect: { versions_include?: string[]; versions_exclude?: string[]; must_not_match?: string[]; per_version?: Record<string, { opening_is_question?: boolean; unsure?: boolean }> };
  voice_samples?: VoiceSample[];
};
const panelVoice = (f: PanelFixture, version: PanelVersion) => buildVoiceInput({ samples: f.voice_samples ?? [], corrections: [], registers: registersFor({ version: version.key }) });
type ReaderInput = { person_name: string; situation: string; versions: Array<{ key: string; label: string; kind: string; change: string; replicate_of: string | null; reply: string; opening_line: string | null; unsure: boolean; rating: string | null }> };
type ReadingFixture = { id: string; expect: { max_differs?: number; min_differs?: number; differs_mentions?: string[] }; input: ReaderInput };
type PanelCases = { panels: PanelFixture[]; readings: ReadingFixture[] };
/** A version says "I try to…" about itself all the time; advice is what it tells its owner to do. */
const ADVICE_TO_OWNER = /\b(you should|you ought to|my advice|i('d| would) (suggest|recommend)|if i were you)\b/i;
const ABOUT_BEING_A_VERSION = /\b(this version|as (a|the) [a-z ]{0,20}version|avatar|was changed|turned down|test run)\b/i;
/** The harness's stand-in for the person's verdicts, so the reader has ratings to work with. */
const EVAL_RATINGS: Record<string, string> = { as_you_are: "me", depleted: "me_on_a_bad_day", asks_first: "me" };

const panelEntries = (f: PanelFixture): DocumentEntry[] =>
  f.entries.map((e, i) => ({ id: `fixture-${i + 1}`, document: e.document, section: e.section, text: e.text, status: "ratified", mark: e.mark, tier: "private", in_their_words: true, source_thread_id: null, source_turns: [], ratified_at: null, created_at: new Date(0) }));

/** Crude word overlap, printed for the reader of the eval output and never used to pass or fail. */
function overlap(a: string, b: string) {
  const words = (t: string) => new Set(t.toLowerCase().match(/[a-z']{4,}/g) ?? []);
  const [x, y] = [words(a), words(b)];
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.max(1, x.size + y.size - shared);
}

function readingProblems(out: { same: string[]; differs: Array<{ observation: string; versions: string[] }>; question: string }, expect: ReadingFixture["expect"], personName: string) {
  const problems: string[] = [];
  const said = [...out.same, ...out.differs.map((d) => d.observation), out.question].join(" ");
  if (new RegExp(`\\b${personName}\\b`).test(said)) problems.push("talks about the person by name, not to them");
  // "You need to know where things stand" describes what a version needs; it is not advice.
  if (ADVICE_TO_OWNER.test(stripRefusals(said))) problems.push("gives advice");
  if (!out.question.trim().endsWith("?")) problems.push("does not end on a question");
  if (expect.max_differs !== undefined && out.differs.length > expect.max_differs) problems.push(`${out.differs.length} difference(s) reported where the answers differ only by chance: ${out.differs.map((d) => d.observation).join(" | ")}`);
  if (expect.min_differs !== undefined && out.differs.length < expect.min_differs) problems.push(`${out.differs.length} difference(s), expected at least ${expect.min_differs}`);
  for (const key of expect.differs_mentions ?? []) if (!out.differs.some((d) => d.versions.includes(key))) problems.push(`no difference points at ${key}`);
  return problems;
}

async function runPanel() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "panel", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "panel", "cases.json"), "utf8")) as PanelCases;
  for (const f of cases.panels) {
    const entries = panelEntries(f);
    const versions = panelVersionsFor(entries);
    const keys = versions.map((v) => v.key);
    const missing = (f.expect.versions_include ?? []).filter((k) => !keys.includes(k));
    const unwanted = (f.expect.versions_exclude ?? []).filter((k) => keys.includes(k));
    record({ suite: "panel", id: `${f.id}/versions`, ok: missing.length + unwanted.length === 0, detail: missing.length + unwanted.length ? `missing ${missing.join(",") || "none"}; should not be built: ${unwanted.join(",") || "none"}` : keys.join(", ") });

    const settled = await Promise.allSettled(
      versions.map((version, i) => {
        const built = buildVersionInput({ personName: f.person_name, entries, situation: f.situation, version, replicate: i + 1, voice: panelVoice(f, version) });
        return withRetry(`panel ${f.id}/${version.key}`, () => callRole("version", built.input, VersionReplySchema, { coupleId: null, jobStep: `eval:panel:${f.id}:${version.key}` }));
      }),
    );
    const answers: Array<{ version: PanelVersion; out: VersionReply }> = [];
    for (const [i, version] of versions.entries()) {
      const r = settled[i];
      if (r.status === "rejected") {
        record({ suite: "panel", id: `${f.id}/${version.key}`, ok: false, detail: r.reason instanceof LlmValidationError ? `rejected: ${r.reason.message.slice(0, 200)}` : String(r.reason) });
        continue;
      }
      const out = r.value;
      answers.push({ version, out });
      const said = `${out.reply} ${out.opening_line ?? ""}`;
      const problems: string[] = [];
      if (!/\bI\b|\bI'|\bI\u2019/.test(out.reply)) problems.push("not in the first person");
      if (ADVICE_TO_OWNER.test(stripRefusals(out.reply))) problems.push("advises the owner");
      if (ABOUT_BEING_A_VERSION.test(said)) problems.push("talks about being a version");
      if (!out.unsure && out.draws_on.length === 0) problems.push("cites none of their lines");
      for (const pattern of f.expect.must_not_match ?? []) if (new RegExp(pattern, "i").test(said)) problems.push(`gives way on a settled line, or repeats a fact from a writing sample: /${pattern.slice(0, 40)}…/`);
      const want = f.expect.per_version?.[version.key];
      if (want?.opening_is_question && !out.opening_line?.trim().endsWith("?")) problems.push(`opening line is not a question: ${out.opening_line}`);
      if (want?.unsure !== undefined && out.unsure !== want.unsure) problems.push(`unsure ${out.unsure}, expected ${want.unsure}`);
      record({ suite: "panel", id: `${f.id}/${version.key}`, ok: problems.length === 0, detail: problems.join("; ") || (out.opening_line ? `"${out.opening_line.slice(0, 90)}"` : out.unsure ? "unsure" : "says nothing yet") });
    }
    if (dumpDir) fs.writeFileSync(path.join(dumpDir, `panel_${f.id}.json`), JSON.stringify({ situation: f.situation, answers: answers.map((a) => ({ key: a.version.key, change: a.version.changeText, ...a.out })) }, null, 2));

    const plain = answers.find((a) => a.version.key === "as_you_are")?.out.reply;
    if (plain) {
      const spread = answers.filter((a) => a.version.key !== "as_you_are").map((a) => `${a.version.key} ${overlap(plain, a.out.reply).toFixed(2)}`);
      console.log(`  word overlap with the plain version (the second run is the noise floor): ${spread.join(", ")}`);
    }

    if (answers.length >= 3) {
      const input: ReaderInput = {
        person_name: f.person_name,
        situation: f.situation,
        versions: answers.map(({ version, out }) => ({ key: version.key, label: version.label, kind: version.kind, change: version.changeText, replicate_of: version.replicate_of ?? null, reply: out.reply, opening_line: out.opening_line, unsure: out.unsure, rating: EVAL_RATINGS[version.key] ?? null })),
      };
      try {
        const out = await withRetry(`panel ${f.id}/reading`, () => callRole("panel_reader", input, panelReadingSchemaFor(input.versions.map((v) => v.key)), { coupleId: null, jobStep: `eval:panel:${f.id}:reading` }));
        if (dumpDir) fs.writeFileSync(path.join(dumpDir, `panel_${f.id}_reading.json`), JSON.stringify(out, null, 2));
        const problems = readingProblems(out, {}, f.person_name);
        record({ suite: "panel", id: `${f.id}/reading`, ok: problems.length === 0, detail: problems.join("; ") || `${out.same.length} held, ${out.differs.length} changed` });
      } catch (err) {
        record({ suite: "panel", id: `${f.id}/reading`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
      }
    }
  }
  for (const c of cases.readings) {
    try {
      const out = await withRetry(`panel reading ${c.id}`, () => callRole("panel_reader", c.input, panelReadingSchemaFor(c.input.versions.map((v) => v.key)), { coupleId: null, jobStep: `eval:panel:reading:${c.id}` }));
      if (dumpDir) fs.writeFileSync(path.join(dumpDir, `panel_reading_${c.id}.json`), JSON.stringify(out, null, 2));
      const problems = readingProblems(out, c.expect, c.input.person_name);
      record({ suite: "panel", id: `reading/${c.id}`, ok: problems.length === 0, detail: problems.join("; ") || `${out.same.length} held, ${out.differs.length} changed` });
    } catch (err) {
      record({ suite: "panel", id: `reading/${c.id}`, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
    }
  }
}

async function runMentor() {
  if (!process.env.ANTHROPIC_API_KEY) {
    record({ suite: "mentor", id: "skipped", ok: !requireLlm, detail: "ANTHROPIC_API_KEY not set" });
    return;
  }
  const cases = JSON.parse(fs.readFileSync(path.join("evals", "mentor", "cases.json"), "utf8")) as { cases: MentorCase[] };
  const means = new Map<string, number>();
  for (const c of cases.cases) {
    try {
      // Fixtures written before the avatar was shown how its person writes carry no voice; the app would send an empty one.
      const input = { ...c.input, voice: c.input.voice ?? EMPTY_VOICE };
      const out = await withRetry(`mentor ${c.id}`, () => callRole("mentor", input, MentorReplySchema, { coupleId: null, jobStep: `eval:mentor:${c.id}` }));
      if (dumpDir) fs.writeFileSync(path.join(dumpDir, `mentor_${c.id}.json`), JSON.stringify({ input, output: out }, null, 2));
      const problems: string[] = [];
      if (!/\b(I|I'm|I've|I'd|my|me)\b/.test(out.reply)) problems.push("not in the first person");
      if (ADVICE.test(stripRefusals(out.reply))) problems.push("instructs the person");
      if (c.expect.unsure && out.question_for_biographer && /\b(does|did|is|has) (he|she|they|ana|ben)\b/i.test(out.question_for_biographer)) problems.push("hand-off question is about the person, not to them");
      if (c.expect.unsure !== undefined && out.unsure !== c.expect.unsure) problems.push(`unsure ${out.unsure}, expected ${c.expect.unsure}`);
      if (c.expect.draws_on_any && !c.expect.draws_on_any.some((id) => out.draws_on.includes(id))) problems.push("draws on none of their lines");
      for (const id of c.expect.draws_on_all ?? []) if (!out.draws_on.includes(id)) problems.push(`does not draw on ${id}`);
      const mean = meanSentenceWords(out.reply);
      means.set(c.id, mean);
      if (c.expect.max_mean_sentence_words !== undefined && mean > c.expect.max_mean_sentence_words) problems.push(`sentences average ${mean.toFixed(1)} words; their samples are much shorter`);
      if (c.expect.min_mean_sentence_words !== undefined && mean < c.expect.min_mean_sentence_words) problems.push(`sentences average ${mean.toFixed(1)} words; their samples run much longer`);
      const borrowed = (c.expect.must_not_mention ?? []).filter((w) => out.reply.toLowerCase().includes(w));
      if (borrowed.length) problems.push(`takes a fact from a writing sample: ${borrowed.join(", ")}`);
      record({ suite: "mentor", id: c.id, ok: problems.length === 0, detail: problems.join("; ") || `${out.unsure ? "unsure" : `${out.draws_on.length} line(s)`}, ${mean.toFixed(1)} words a sentence` });
    } catch (err) {
      record({ suite: "mentor", id: c.id, ok: false, detail: err instanceof LlmValidationError ? `rejected: ${err.message.slice(0, 200)}` : String(err) });
    }
  }
  // The same lines and the same question, with two different sets of writing samples: manner has to follow the samples.
  for (const c of cases.cases) {
    const want = c.expect.shorter_sentences_than;
    const [mine, theirs] = [means.get(c.id), want ? means.get(want.case) : undefined];
    if (!want || mine === undefined || theirs === undefined) continue;
    const ok = theirs - mine >= want.by;
    record({ suite: "mentor", id: `${c.id}/manner`, ok, detail: `${mine.toFixed(1)} words a sentence against ${theirs.toFixed(1)} for ${want.case}${ok ? "" : `; expected at least ${want.by} fewer`}` });
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
  const panel = JSON.parse(fs.readFileSync(path.join("evals", "panel", "cases.json"), "utf8")) as PanelCases;
  for (const f of panel.panels) {
    const entries = panelEntries(f);
    for (const [i, version] of panelVersionsFor(entries).entries()) {
      const req = buildRequest("version", buildVersionInput({ personName: f.person_name, entries, situation: f.situation, version, replicate: i + 1, voice: panelVoice(f, version) }).input, VersionReplySchema as ZodType<unknown>);
      const tokens = write(`version-${f.id}-${version.key}`, req);
      record({ suite: "dry_run", id: `version:${f.id}:${version.key}`, ok: req.tool_choice?.type === "tool", detail: `~${tokens} tokens` });
      n++;
    }
  }
  for (const c of panel.readings) {
    const req = buildRequest("panel_reader", c.input, PanelReadingSchema as ZodType<unknown>);
    const tokens = write(`panel_reader-${c.id}`, req);
    record({ suite: "dry_run", id: `panel_reader:${c.id}`, ok: req.tool_choice?.type === "tool", detail: `~${tokens} tokens` });
    n++;
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
  if (!dryRun && (suite === "all" || suite === "panel")) await runPanel();
  if (!dryRun && (suite === "all" || suite === "guardrail")) await runGuardrail();
  if (!dryRun && (suite === "all" || suite === "replay")) await runReplay();
  if (!dryRun && (suite === "all" || suite === "sandbox")) await runSandbox();
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
