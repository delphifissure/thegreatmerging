"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FEATURES } from "@/config/features";
import * as data from "@/lib/data";
import { callRole, configureLlm, MemoryMemo } from "@/lib/llm";
import { MoveCodeSchema, PersonasSchema, RehearsalTurnSchema, type Personas } from "@/lib/llm/schemas";
import { buildMoveCoderInput, cleanSpeech } from "@/lib/replay/inputs";
import { buildSandboxAvatarInput, nextSide, SANDBOX_EXTEND_BY, SANDBOX_HARD_LIMIT, sandboxIsOver, ScenarioSchema, type Scenario } from "@/lib/sandbox/scenario";
import { readSandbox } from "@/lib/sandbox/read";
import { requireAppUser } from "@/app/_lib/session";
import { fail, type ActionResult } from "@/app/_lib/actions";

/** Usage rows go to the database; outputs are never memoized there. A sandbox is fiction, but people write fiction close to home. */
function configurePrivateLlm() {
  configureLlm({ recorder: new data.DbRecorder(), memo: new MemoryMemo() });
}

export type GenerateResult = { ok: true; personas: Personas } | { ok: false; error: string };
const GenerateInput = z.object({ seed: z.string().trim().max(1200), nameA: z.string().trim().max(40).optional(), nameB: z.string().trim().max(40).optional() });

/** Invent two people and the life they share. Nothing is stored: the result goes into the form, to be edited. */
export async function generatePersonasAction(raw: z.infer<typeof GenerateInput>): Promise<GenerateResult> {
  if (!FEATURES.biographer) return { ok: false, error: "This is not switched on." };
  const parsed = GenerateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Keep the description under 1,200 characters." };
  const user = await requireAppUser();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The model is not configured." };
  const names = parsed.data.nameA && parsed.data.nameB ? [parsed.data.nameA, parsed.data.nameB] : null;
  try {
    configurePrivateLlm();
    const personas = await callRole("persona_writer", { seed: parsed.data.seed, names }, PersonasSchema, { coupleId: null, userId: user.id, jobStep: "sandbox:personas" });
    return { ok: true, personas };
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

export type AdvanceResult = { ok: true; done: boolean; turns: number } | { ok: false; error: string };
const AdvanceInput = z.object({ threadId: z.uuid(), expected: z.number().int().min(0).max(SANDBOX_HARD_LIMIT) });

/** One more turn. Called in a loop from the browser so no request is long. */
export async function advanceSandboxAction(raw: z.infer<typeof AdvanceInput>): Promise<AdvanceResult> {
  if (!FEATURES.biographer) return { ok: false, error: "This is not switched on." };
  const parsed = AdvanceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That sandbox could not be found." };
  const user = await requireAppUser();
  const box = await readSandbox(parsed.data.threadId, user.id);
  if (!box) return { ok: false, error: "That sandbox is not yours." };
  if (box.turns.length !== parsed.data.expected) return { ok: true, done: sandboxIsOver(box.turns, box.maxTurns), turns: box.turns.length };
  if (sandboxIsOver(box.turns, box.maxTurns)) return { ok: true, done: true, turns: box.turns.length };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The model is not configured." };

  configurePrivateLlm();
  const ctx = { coupleId: null, userId: user.id };
  const scenario: Scenario = box.scenario;
  const side = nextSide(scenario, box.turns);
  const asSpoken = (turns: typeof box.turns) => turns.map((t) => ({ speakerId: t.side, says: t.says, does: t.does }));
  try {
    let turn: { says: string | null; does: string | null; ends: boolean; intent: number | null; impact: number | null; given: boolean };
    if (box.turns.length === 0 && scenario.openingLine) {
      turn = { says: scenario.openingLine, does: null, ends: false, intent: null, impact: null, given: true };
    } else {
      const out = await callRole("sandbox_avatar", buildSandboxAvatarInput(scenario, side, box.turns, box.maxTurns), RehearsalTurnSchema, { ...ctx, jobStep: `sandbox:turn:${side}` });
      turn = { says: cleanSpeech(out.says), does: out.does?.trim() || null, ends: out.ends, intent: out.intent, impact: out.impact, given: false };
    }
    const code = await callRole("move_coder", buildMoveCoderInput([...asSpoken(box.turns), { speakerId: side, says: turn.says, does: turn.does }], scenario.firstSpeaker), MoveCodeSchema, { ...ctx, jobStep: "sandbox:code" });
    await data.appendTurn({
      threadId: box.threadId,
      userId: user.id,
      role: "avatar",
      text: JSON.stringify({ says: turn.says, does: turn.does }),
      meta: { kind: "turn", side, move: code.move, secondary: code.secondary, intent: turn.intent, impact: turn.impact, ends: turn.ends, given: turn.given },
    });
    const count = box.turns.length + 1;
    const done = sandboxIsOver([...box.turns, { side, ...turn }], box.maxTurns);
    refresh();
    return { ok: true, done, turns: count };
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
  if (box.maxTurns + SANDBOX_EXTEND_BY > SANDBOX_HARD_LIMIT) return fail("That is as long as a sandbox conversation goes. Start a new one from this one to carry on.");
  if (box.turns[box.turns.length - 1]?.ends) return fail("One of them ended the conversation. Start a new one from this one to try it another way.");
  await data.appendTurn({ threadId: box.threadId, userId: user.id, role: "guide", text: "", meta: { kind: "extend", by: SANDBOX_EXTEND_BY } });
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
