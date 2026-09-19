"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { callRole, configureLlm, MemoryMemo } from "@/lib/llm";
import { AvatarBriefSchema, MoveCodeSchema, SandboxTurnSchema, type Personas } from "@/lib/llm/schemas";
import { generatePersonas } from "@/lib/sandbox/generate";
import { buildMoveCoderInput, cleanSpeech } from "@/lib/replay/inputs";
import { briefsReady, buildBriefWriterInput, buildSandboxAvatarInput, nextSide, SANDBOX_EXTEND_BY, SANDBOX_HARD_LIMIT, sandboxIsOver, ScenarioSchema, type Scenario } from "@/lib/sandbox/scenario";
import { randomInt } from "node:crypto";
import { parseScenario, readSandbox } from "@/lib/sandbox/read";
import { pickNames, surpriseSeed } from "@/lib/sandbox/names";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

/** Usage rows go to the database; outputs are never memoized there. A sandbox is fiction, but people write fiction close to home. */
function configurePrivateLlm() {
  configureLlm({ recorder: new data.DbRecorder(), memo: new MemoryMemo() });
}

export type GenerateResult = { ok: true; personas: Personas; seedUsed: string } | { ok: false; error: string };
const GenerateInput = z.object({ seed: z.string().trim().max(1200), nameA: z.string().trim().max(40).optional(), nameB: z.string().trim().max(40).optional() });

/** Invent two people and the life they share. Nothing is stored: the result goes into the form, to be edited. */
export async function generatePersonasAction(raw: z.infer<typeof GenerateInput>): Promise<GenerateResult> {
  if (!FEATURES.biographer) return { ok: false, error: "This is not switched on." };
  const parsed = GenerateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Keep the description under 1,200 characters." };
  const user = await requireAppUser();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The model is not configured." };
  // Names and, when asked for a surprise, the outline of the couple are drawn here and not by the model,
  // which has a few favourite names and a few favourite lives. Names from this person's earlier sandboxes are avoided.
  const draw = (max: number) => randomInt(max);
  const used = (await data.listSandboxes(user.id, 50)).flatMap((b) => {
    const s = parseScenario(b.scenario);
    return s ? [s.a.name, s.b.name] : [];
  });
  const names = pickNames({ typed: [parsed.data.nameA, parsed.data.nameB], used, draw });
  const seed = parsed.data.seed || surpriseSeed(draw);
  try {
    configurePrivateLlm();
    const personas = await generatePersonas({ seed, names, call: (role, input, schema, step) => callRole(role, input, schema, { coupleId: null, userId: user.id, jobStep: `sandbox:${step}` }) });
    return { ok: true, personas, seedUsed: seed };
  } catch {
    return { ok: false, error: "That did not come through. Try again, or write them yourself." };
  }
}

/** Keep the scenario as the first turn of a private thread, and go to it. */
export async function createSandboxAction(raw: unknown): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Both people need a name and some notes, and there has to be a shared history and a situation.");
  const user = await requireAppUser();
  const thread = await data.createThread({ userId: user.id, kind: "sandbox", focus: null });
  await data.appendTurn({ threadId: thread.id, userId: user.id, role: "guide", text: JSON.stringify(parsed.data), meta: { kind: "scenario" } });
  redirect(`/sandbox/${thread.id}`);
}

const BriefsInput = z.object({ threadId: z.uuid() });

/**
 * Write each avatar's brief: its person's notes, the shared history and the situation, rewritten TO
 * that person in the second person. Each is made without sight of the other person's notes.
 */
export async function writeBriefsAction(raw: z.infer<typeof BriefsInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = BriefsInput.safeParse(raw);
  if (!parsed.success) return fail("That sandbox could not be found.");
  const user = await requireAppUser();
  const box = await readSandbox(parsed.data.threadId, user.id);
  if (!box) return fail("That sandbox is not yours.");
  if (box.turns.length > 0) return fail("They have started talking. Start a new sandbox from this one to change what they are told.");
  if (!process.env.ANTHROPIC_API_KEY) return fail("The model is not configured.");
  try {
    configurePrivateLlm();
    const [a, b] = await Promise.all((["a", "b"] as const).map((side) => callRole("brief_writer", buildBriefWriterInput(box.scenario, side), AvatarBriefSchema, { coupleId: null, userId: user.id, jobStep: `sandbox:brief:${side}` })));
    await data.appendTurn({ threadId: box.threadId, userId: user.id, role: "guide", text: a.brief.trim(), meta: { kind: "brief", side: "a" } });
    await data.appendTurn({ threadId: box.threadId, userId: user.id, role: "guide", text: b.brief.trim(), meta: { kind: "brief", side: "b" } });
  } catch {
    return fail("The briefs did not come through. Try again.");
  }
  refresh();
  return { ok: true };
}

const SaveBriefInput = z.object({ threadId: z.uuid(), side: z.enum(["a", "b"]), text: z.string().trim().min(40).max(12000) });

/** A brief is the avatar's whole world, so whoever runs the sandbox can rewrite it by hand until the conversation starts. */
export async function saveBriefAction(raw: z.infer<typeof SaveBriefInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = SaveBriefInput.safeParse(raw);
  if (!parsed.success) return fail("A brief needs a few sentences at least.");
  const user = await requireAppUser();
  const box = await readSandbox(parsed.data.threadId, user.id);
  if (!box) return fail("That sandbox is not yours.");
  if (box.turns.length > 0) return fail("They have started talking. Start a new sandbox from this one to change what they are told.");
  await data.appendTurn({ threadId: box.threadId, userId: user.id, role: "guide", text: parsed.data.text, meta: { kind: "brief", side: parsed.data.side, edited: true } });
  refresh();
  return { ok: true, message: "Saved. This is what they will be told." };
}

/** The turn just taken comes back with the result, so the browser can show it at once and not wait for the page to be fetched again. */
export type LiveTurn = { index: number; side: "a" | "b"; says: string | null; does: string | null; felt: string | null; wants: string | null; move: string; secondary: string | null; intent: number | null; impact: number | null; ends: boolean; given: boolean };
export type AdvanceResult = { ok: true; done: boolean; turns: number; turn: LiveTurn | null } | { ok: false; error: string };
const AdvanceInput = z.object({ threadId: z.uuid(), expected: z.number().int().min(0).max(SANDBOX_HARD_LIMIT) });

/** One more turn. Called in a loop from the browser so no request is long. */
export async function advanceSandboxAction(raw: z.infer<typeof AdvanceInput>): Promise<AdvanceResult> {
  if (!FEATURES.biographer) return { ok: false, error: "This is not switched on." };
  const parsed = AdvanceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That sandbox could not be found." };
  const user = await requireAppUser();
  const box = await readSandbox(parsed.data.threadId, user.id);
  if (!box) return { ok: false, error: "That sandbox is not yours." };
  if (box.turns.length !== parsed.data.expected) return { ok: true, done: sandboxIsOver(box.turns, box.maxTurns), turns: box.turns.length, turn: null };
  if (sandboxIsOver(box.turns, box.maxTurns)) return { ok: true, done: true, turns: box.turns.length, turn: null };
  if (!briefsReady(box.briefs)) return { ok: false, error: "Write their briefs first." };
  const briefs = box.briefs;
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The model is not configured." };

  configurePrivateLlm();
  const ctx = { coupleId: null, userId: user.id };
  const scenario: Scenario = box.scenario;
  const side = nextSide(scenario, box.turns);
  const asSpoken = (turns: typeof box.turns) => turns.map((t) => ({ speakerId: t.side, says: t.says, does: t.does }));
  try {
    let turn: { says: string | null; does: string | null; felt: string | null; wants: string | null; ends: boolean; intent: number | null; impact: number | null; given: boolean };
    if (box.turns.length === 0 && scenario.openingLine) {
      turn = { says: scenario.openingLine, does: null, felt: null, wants: null, ends: false, intent: null, impact: null, given: true };
    } else {
      const out = await callRole("sandbox_avatar", buildSandboxAvatarInput(scenario, side, briefs[side], box.turns), SandboxTurnSchema, { ...ctx, jobStep: `sandbox:turn:${side}` });
      turn = { says: cleanSpeech(out.says), does: out.does?.trim() || null, felt: out.felt.trim(), wants: out.wants.trim(), ends: out.ends, intent: out.intent, impact: out.impact, given: false };
    }
    const code = await callRole("move_coder", buildMoveCoderInput([...asSpoken(box.turns), { speakerId: side, says: turn.says, does: turn.does }], scenario.firstSpeaker), MoveCodeSchema, { ...ctx, jobStep: "sandbox:code" });
    await data.appendTurn({
      threadId: box.threadId,
      userId: user.id,
      role: "avatar",
      // What it felt and wanted is kept with its words, encrypted: for whoever runs the sandbox, never for the other avatar.
      text: JSON.stringify({ says: turn.says, does: turn.does, felt: turn.felt, wants: turn.wants }),
      meta: { kind: "turn", side, move: code.move, secondary: code.secondary, intent: turn.intent, impact: turn.impact, ends: turn.ends, given: turn.given },
    });
    const count = box.turns.length + 1;
    const done = sandboxIsOver([...box.turns, { side, ...turn }], box.maxTurns);
    refresh();
    return { ok: true, done, turns: count, turn: { index: count - 1, side, says: turn.says, does: turn.does, felt: turn.felt, wants: turn.wants, move: code.move, secondary: code.secondary, intent: turn.intent, impact: turn.impact, ends: turn.ends, given: turn.given } };
  } catch {
    return { ok: false, error: "That turn did not come through. Nothing is lost: try again and it carries on from here." };
  }
}

const IdInput = z.object({ threadId: z.uuid() });

/** Give a conversation that ran out of turns room for a few more. */
export async function extendSandboxAction(raw: z.infer<typeof IdInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = IdInput.safeParse(raw);
  if (!parsed.success) return fail("That sandbox could not be found.");
  const user = await requireAppUser();
  const box = await readSandbox(parsed.data.threadId, user.id);
  if (!box) return fail("That sandbox is not yours.");
  if (box.maxTurns >= SANDBOX_HARD_LIMIT) return fail("That is as long as a sandbox conversation goes. Start a new one from this one to carry on.");
  if (box.turns[box.turns.length - 1]?.ends) return fail("One of them ended the conversation. Start a new one from this one to try it another way.");
  await data.appendTurn({ threadId: box.threadId, userId: user.id, role: "guide", text: "", meta: { kind: "extend", by: Math.min(SANDBOX_EXTEND_BY, SANDBOX_HARD_LIMIT - box.maxTurns) } });
  refresh();
  return { ok: true };
}

export async function deleteSandboxAction(raw: z.infer<typeof IdInput>): Promise<ActionResult> {
  if (!FEATURES.biographer) return fail("This is not switched on.");
  const parsed = IdInput.safeParse(raw);
  if (!parsed.success) return fail("That sandbox could not be found.");
  const user = await requireAppUser();
  if (!(await data.deleteSandbox({ threadId: parsed.data.threadId, userId: user.id }))) return fail("That sandbox could not be removed.");
  redirect("/sandbox");
}
