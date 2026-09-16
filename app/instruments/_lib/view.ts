/** Serializable view of an instrument for the item screen: only what the person answering needs. */
import { scaleFor } from "@/instruments/define";
import type { InstrumentModule } from "@/instruments/define";
import { TODO_TEXT, type Response } from "@/instruments/schema";

export type ScaleView = { min: number; max: number; labels?: string[] };
export type ItemView = { item_id: string; text: string; placeholder: boolean; descriptor: string; group?: string; scales: Record<string, ScaleView> };
export type InstrumentView = {
  key: string;
  name: string;
  source_citation: string;
  license_note: string;
  unvalidated: boolean;
  mental_health: boolean;
  passes: string[];
  pass_prompts: Record<string, string>;
  attribution_prompt: string | null;
  attribution_gap_at_or_above: number | null;
  items: ItemView[];
};

export function instrumentView(mod: InstrumentModule): InstrumentView {
  const def = mod.definition;
  return {
    key: def.key,
    name: def.name,
    source_citation: def.source_citation,
    license_note: def.license_note,
    unvalidated: def.unvalidated,
    mental_health: def.mental_health,
    passes: [...def.passes],
    pass_prompts: def.pass_prompts ?? {},
    attribution_prompt: def.attribution_prompt ?? null,
    attribution_gap_at_or_above: def.attribution_gap_at_or_above ?? null,
    items: def.items.map((it) => ({
      item_id: it.item_id,
      text: it.text === TODO_TEXT ? `[${it.descriptor}]` : it.text,
      placeholder: it.text === TODO_TEXT,
      descriptor: it.descriptor,
      group: it.group,
      scales: Object.fromEntries(def.passes.map((p) => [p, scaleFor(it, p)])),
    })),
  };
}

export type AnswerMap = Record<string, { value: number; needs_context: boolean }>;

export function answerKey(pass: string, itemId: string): string {
  return `${pass}::${itemId}`;
}

export function answerMap(def: InstrumentModule["definition"], responses: Response[]): AnswerMap {
  const out: AnswerMap = {};
  for (const r of responses) out[answerKey(r.pass ?? def.passes[0], r.item_id)] = { value: r.value, needs_context: r.needs_context ?? false };
  return out;
}

/** Index of the first item with any pass unanswered; the last item when everything is answered. */
export function firstUnansweredIndex(view: InstrumentView, answers: AnswerMap): number {
  const idx = view.items.findIndex((it) => view.passes.some((p) => !(answerKey(p, it.item_id) in answers)));
  return idx === -1 ? Math.max(0, view.items.length - 1) : idx;
}

export const GROUP_TITLES: Record<string, string> = {
  household_tasks: "Household tasks",
  decisions: "Decisions",
  childcare: "Childcare",
};
