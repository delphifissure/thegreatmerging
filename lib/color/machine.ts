/**
 * Color-layer state machine (section 6). A hand-rolled reducer with states
 *   specifics | preference | tag | polarization | perception_gap | context | consistency | complete
 * and a per-state question queue derived from the domain's config and the user's flags.
 *
 * No model presents questions: every question, acknowledgement and transition is fixed text
 * from config/color_modules/<domain>.json. The model is consulted at exactly three points,
 * surfaced here as effects the caller must run:
 *   - "run_concreteness": the heuristic was unsure about a specifics/preference answer;
 *   - "run_prober": entry to `consistency`; the caller appends the probes it gets back;
 *   - (guardrail runs inside lib/llm on probe text).
 * State and queue are persisted by the caller after every turn (color_sessions.state).
 */
import { assessConcreteness, type ConcretenessConfig, DEFAULT_CONCRETENESS_CONFIG } from "./concreteness";
import type { Domain } from "@/instruments/schema";

export const COLOR_STATES = [
  "specifics",
  "preference",
  "tag",
  "polarization",
  "perception_gap",
  "context",
  "consistency",
  "complete",
] as const;
export type ColorState = (typeof COLOR_STATES)[number];

export type ColorModuleQuestion = { id: string; text: string; group?: string; condition?: string };
export type ColorModuleTag = { id: string; topics: string[]; group?: string; condition?: string };
export type ColorModuleConfig = {
  domain: Domain;
  title: string;
  version: string;
  groups?: Record<string, string>;
  specifics: ColorModuleQuestion[];
  preference: ColorModuleQuestion[];
  tags: ColorModuleTag[];
  common: {
    preference_universal: string;
    tag_question: string;
    tag_comment_prompt: string;
    perception_gap: string;
    context: string;
    polarization: string;
    concreteness_followup: string;
    probe_skip_label: string;
    transitions: Record<string, string>;
  };
};

export type QueueItem = {
  /** Unique within the session; used as color_answers.question_id. */
  id: string;
  step: Exclude<ColorState, "complete">;
  kind: "question" | "tag" | "probe" | "followup";
  text: string;
  /** Instrument item or dimension this question is about, when any. */
  item_ref?: string;
  group?: string;
  /** For tags: the topics the tag is about (shown with the question). */
  topics?: string[];
  /** For probes: the reason attached (shown with the question) and the template used. */
  reason_text?: string;
  template_id?: number;
  /** For concreteness follow-ups: the question this follows. */
  followup_of?: string;
};

export type AnswerRecord = {
  question_id: string;
  step: QueueItem["step"];
  item_ref?: string;
  answer_text: string | null;
  skipped: boolean;
  tag?: "requirement" | "preference";
  comment?: string;
  answered_at: string;
};

export type MachineState = {
  version: 1;
  domain: Domain;
  state: ColorState;
  queue: QueueItem[];
  cursor: number;
  answers: AnswerRecord[];
  /** Question IDs that already received the one allowed concreteness follow-up. */
  followups_used: string[];
  /** Question IDs waiting on the concreteness model. */
  pending_concreteness: string[];
  probes_requested: boolean;
  probes_loaded: boolean;
  completed_at: string | null;
};

export type InitContext = {
  /** Items in this domain the user checkboxed as needing context. */
  needs_context_items: Array<{ item_ref: string; descriptor: string; value: number; pass?: string }>;
  /** Items where the user's self rating and the partner's rating of them differ by 2 or more. */
  perception_gaps: Array<{ item_ref: string; descriptor: string; self_value: number; partner_value: number }>;
  /** Polarization dimensions in this domain where the two self ratings differ by 2 or more. */
  polarization_gaps: Array<{ item_ref: string; descriptor: string; self_alone: number; self_with_partner: number }>;
  multi_caregiver: boolean;
};

export type Action =
  | { type: "answer"; text: string; at?: string }
  | { type: "skip"; at?: string }
  | { type: "tag"; tag: "requirement" | "preference"; comment: string; at?: string }
  | { type: "concreteness_result"; question_id: string; concrete: boolean }
  | { type: "probes_loaded"; probes: Array<{ template_id: number; question_text: string; reason_text: string; references: string[] }> };

export type Effect =
  | { type: "run_concreteness"; question_id: string; question_text: string; answer_text: string }
  | { type: "run_prober" }
  | { type: "persist" };

export class MachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachineError";
  }
}

function fill(template: string, subs: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in subs ? String(subs[k]) : `{${k}}`));
}

function conditionMet(cond: string | undefined, ctx: InitContext): boolean {
  if (!cond) return true;
  if (cond === "multi_caregiver") return ctx.multi_caregiver;
  return false;
}

/** Build the full queue for a domain from config and this user's flags. */
export function buildQueue(config: ColorModuleConfig, ctx: InitContext): QueueItem[] {
  const q: QueueItem[] = [];
  for (const s of config.specifics) {
    if (!conditionMet(s.condition, ctx)) continue;
    q.push({ id: s.id, step: "specifics", kind: "question", text: s.text, group: s.group });
  }
  for (const p of config.preference) {
    if (!conditionMet(p.condition, ctx)) continue;
    q.push({ id: p.id, step: "preference", kind: "question", text: p.text, group: p.group });
  }
  for (const t of config.tags) {
    if (!conditionMet(t.condition, ctx)) continue;
    q.push({ id: t.id, step: "tag", kind: "tag", text: config.common.tag_question, topics: t.topics, group: t.group });
  }
  for (const g of ctx.polarization_gaps) {
    q.push({
      id: `polarization:${g.item_ref}`,
      step: "polarization",
      kind: "question",
      item_ref: g.item_ref,
      text: fill(config.common.polarization, { self_alone: g.self_alone, self_with_partner: g.self_with_partner }),
    });
  }
  for (const g of ctx.perception_gaps) {
    q.push({
      id: `perception_gap:${g.item_ref}`,
      step: "perception_gap",
      kind: "question",
      item_ref: g.item_ref,
      text: fill(config.common.perception_gap, { self_value: g.self_value, partner_value: g.partner_value }),
    });
  }
  for (const c of ctx.needs_context_items) {
    q.push({ id: `context:${c.item_ref}${c.pass ? `:${c.pass}` : ""}`, step: "context", kind: "question", item_ref: c.item_ref, text: config.common.context });
  }
  return q;
}

export function initMachine(config: ColorModuleConfig, ctx: InitContext): MachineState {
  const queue = buildQueue(config, ctx);
  const state: MachineState = {
    version: 1,
    domain: config.domain,
    state: "specifics",
    queue,
    cursor: 0,
    answers: [],
    followups_used: [],
    pending_concreteness: [],
    probes_requested: false,
    probes_loaded: false,
    completed_at: null,
  };
  return settle(state).state;
}

export function currentItem(s: MachineState): QueueItem | null {
  if (s.state === "complete") return null;
  return s.queue[s.cursor] ?? null;
}

/** "Specifics, 2 of 3" style label for the header. */
export function progressLabel(s: MachineState, config: ColorModuleConfig): string {
  if (s.state === "complete") return config.common.transitions.complete;
  const item = currentItem(s);
  if (!item) return config.common.transitions[s.state] ?? s.state;
  const sameStep = s.queue.filter((x) => x.step === item.step);
  const index = sameStep.findIndex((x) => x.id === item.id) + 1;
  const name = config.common.transitions[item.step] ?? item.step;
  return `${name}, ${index} of ${sameStep.length}`;
}

/**
 * Move the machine to the state of the item at the cursor, skipping states with no items,
 * and raise the prober effect on entry to consistency. Idempotent.
 */
function settle(s: MachineState): { state: MachineState; effects: Effect[] } {
  const effects: Effect[] = [];
  let st = { ...s };
  if (st.state === "complete") return { state: st, effects };
  const item = st.queue[st.cursor];
  if (item) {
    st.state = item.step;
    return { state: st, effects };
  }
  // No more queued items. Either we still owe the prober, or we are done.
  if (!st.probes_requested) {
    st = { ...st, state: "consistency", probes_requested: true };
    effects.push({ type: "run_prober" });
    return { state: st, effects };
  }
  if (!st.probes_loaded) {
    // Waiting for the prober; stay in consistency with nothing to show.
    st.state = "consistency";
    return { state: st, effects };
  }
  st = { ...st, state: "complete", completed_at: st.completed_at ?? new Date().toISOString() };
  return { state: st, effects };
}

export function reduce(
  s: MachineState,
  action: Action,
  config: ColorModuleConfig,
  concretenessCfg: ConcretenessConfig = DEFAULT_CONCRETENESS_CONFIG,
): { state: MachineState; effects: Effect[] } {
  const at = "at" in action && action.at ? action.at : new Date().toISOString();
  let st: MachineState = { ...s, answers: [...s.answers], queue: [...s.queue], followups_used: [...s.followups_used], pending_concreteness: [...s.pending_concreteness] };
  const effects: Effect[] = [];

  switch (action.type) {
    case "answer": {
      const item = currentItem(st);
      if (!item) throw new MachineError("no current question to answer");
      if (item.kind === "tag") throw new MachineError("tag questions need a tag action with a comment");
      const text = action.text.trim();
      if (!text) throw new MachineError("answer is empty; use skip to skip");
      st.answers.push({ question_id: item.id, step: item.step, item_ref: item.item_ref, answer_text: text, skipped: false, answered_at: at });
      // Concreteness applies to specifics and preference answers, once per original question.
      if ((item.step === "specifics" || item.step === "preference") && item.kind === "question" && !st.followups_used.includes(item.id)) {
        const verdict = assessConcreteness(text, concretenessCfg).verdict;
        if (verdict === "fail") {
          st = insertFollowup(st, item, config);
        } else if (verdict === "unsure") {
          st.pending_concreteness.push(item.id);
          effects.push({ type: "run_concreteness", question_id: item.id, question_text: item.text, answer_text: text });
        }
      }
      st.cursor += 1;
      break;
    }
    case "skip": {
      const item = currentItem(st);
      if (!item) throw new MachineError("nothing to skip");
      if (item.kind === "tag") throw new MachineError("a tag cannot be skipped; it needs a choice and a comment");
      st.answers.push({ question_id: item.id, step: item.step, item_ref: item.item_ref, answer_text: null, skipped: true, answered_at: at });
      st.cursor += 1;
      break;
    }
    case "tag": {
      const item = currentItem(st);
      if (!item || item.kind !== "tag") throw new MachineError("current question is not a tag");
      const comment = action.comment.trim();
      if (!comment) throw new MachineError("a tag requires a non-empty comment");
      st.answers.push({ question_id: item.id, step: "tag", item_ref: item.item_ref, answer_text: comment, skipped: false, tag: action.tag, comment, answered_at: at });
      st.cursor += 1;
      break;
    }
    case "concreteness_result": {
      st.pending_concreteness = st.pending_concreteness.filter((q) => q !== action.question_id);
      if (!action.concrete && !st.followups_used.includes(action.question_id)) {
        const original = st.queue.find((q) => q.id === action.question_id);
        if (original) st = insertFollowup(st, original, config);
      }
      break;
    }
    case "probes_loaded": {
      if (st.probes_loaded) break;
      st.probes_loaded = true;
      for (const [i, p] of action.probes.slice(0, 3).entries()) {
        st.queue.push({
          id: `probe:${i + 1}`,
          step: "consistency",
          kind: "probe",
          text: p.question_text,
          reason_text: p.reason_text,
          template_id: p.template_id,
        });
      }
      break;
    }
    default: {
      const never: never = action;
      throw new MachineError(`unknown action ${JSON.stringify(never)}`);
    }
  }

  const settled = settle(st);
  effects.push(...settled.effects, { type: "persist" });
  return { state: settled.state, effects };
}

/** Insert the one allowed "Can you give me a specific example?" right after the answered question. */
function insertFollowup(st: MachineState, original: QueueItem, config: ColorModuleConfig): MachineState {
  const idx = st.queue.findIndex((q) => q.id === original.id);
  const followup: QueueItem = {
    id: `${original.id}:example`,
    step: original.step,
    kind: "followup",
    text: config.common.concreteness_followup,
    item_ref: original.item_ref,
    group: original.group,
    followup_of: original.id,
  };
  const queue = [...st.queue];
  // If the cursor already moved past the original (async concreteness), insert at the cursor.
  const insertAt = st.cursor > idx ? st.cursor : idx + 1;
  queue.splice(insertAt, 0, followup);
  return { ...st, queue, followups_used: [...st.followups_used, original.id] };
}

/** Effects a caller must still run for a freshly initialized or reloaded state (e.g. an empty queue that went straight to consistency). */
export function pendingEffects(s: MachineState): Effect[] {
  if (s.state === "consistency" && s.probes_requested && !s.probes_loaded) return [{ type: "run_prober" }];
  return [];
}

export function isComplete(s: MachineState): boolean {
  return s.state === "complete";
}

export function answersByStep(s: MachineState, step: QueueItem["step"]): AnswerRecord[] {
  return s.answers.filter((a) => a.step === step);
}
