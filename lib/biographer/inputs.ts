/**
 * Pure builders for the biographer, drafter and one-notch-ahead roles. They turn stored turns and
 * ratified lines into the JSON each role sees, using short ids ("t3", "e2") that are mapped back
 * afterwards, so no database id reaches a prompt.
 */
import biographerConfig from "@/config/biographer.json";
import { sectionBelongsTo, type BiographerTurn, type DrafterOutput } from "@/lib/llm/schemas";
import type { DocumentEntry, Turn } from "@/lib/data/biographer";

export type Focus = { key: string; title: string; about: string; opening: string; lands_in: string[] };

export const FOCI: Focus[] = biographerConfig.foci;
export const MENTOR_GATE = biographerConfig.mentor;

export function focusByKey(key: string | null | undefined): Focus | null {
  return FOCI.find((f) => f.key === key) ?? null;
}

export const turnId = (seq: number) => `t${seq}`;
export const seqOfTurnId = (id: string): number | null => {
  const m = /^t(\d+)$/.exec(id.trim());
  return m ? Number(m[1]) : null;
};

const modelTurns = (turns: Turn[]) => turns.map((t) => ({ id: turnId(t.seq), role: t.role, text: t.text }));

const ratifiedLines = (entries: DocumentEntry[]) => entries.filter((e) => e.status === "ratified").map((e) => ({ document: e.document, section: e.section, text: e.text }));

export function buildBiographerInput(input: { personName: string; focus: Focus; turns: Turn[]; entries: DocumentEntry[]; openQuestions: string[] }) {
  return {
    person_name: input.personName,
    focus: { key: input.focus.key, title: input.focus.title, about: input.focus.about },
    turns: modelTurns(input.turns),
    ratified: ratifiedLines(input.entries),
    open_questions: input.openQuestions.slice(0, 5),
  };
}

export function buildDrafterInput(input: { personName: string; focus: Focus; turns: Turn[]; entries: DocumentEntry[] }) {
  return {
    person_name: input.personName,
    focus: { key: input.focus.key, title: input.focus.title, about: input.focus.about },
    turns: modelTurns(input.turns),
    already_ratified: ratifiedLines(input.entries),
  };
}

/** Keep only proposals that rest on something the person actually said in this thread. */
export function entriesFromDraft(output: DrafterOutput, turns: Turn[]) {
  const personSeqs = new Set(turns.filter((t) => t.role === "person").map((t) => t.seq));
  return output.entries.flatMap((e) => {
    if (!sectionBelongsTo(e.document, e.section)) return [];
    const seqs = e.source_turn_ids.map(seqOfTurnId).filter((n): n is number => n !== null && personSeqs.has(n));
    if (seqs.length === 0) return [];
    return [{ document: e.document, section: e.section, text: e.text.trim(), mark: e.suggested_mark, in_their_words: e.in_their_words, source_turns: seqs }];
  });
}

/** The biographer may only point at turns that exist. */
export function cleanReferences(turn: BiographerTurn, turns: Turn[]): number[] {
  const seqs = new Set(turns.map((t) => t.seq));
  return turn.references.map(seqOfTurnId).filter((n): n is number => n !== null && seqs.has(n));
}

export type MentorReadiness = { ready: boolean; ratifiedConstitution: number; hasDirection: boolean; needed: number };

/** The avatar needs enough ratified material to be recognizable, and a direction to be one notch ahead in. */
export function mentorReadiness(entries: DocumentEntry[]): MentorReadiness {
  const constitution = entries.filter((e) => e.status === "ratified" && e.document === "constitution");
  const hasDirection = constitution.some((e) => e.section === MENTOR_GATE.requires_section);
  const needed = MENTOR_GATE.min_ratified_constitution_lines;
  return { ready: constitution.length >= needed && hasDirection, ratifiedConstitution: constitution.length, hasDirection, needed };
}

/** Ratified lines only, with short ids the reply can cite. Private-tier lines are the owner's own, so their avatar may use them with them. */
export function buildMentorInput(input: { personName: string; entries: DocumentEntry[]; turns: Turn[] }) {
  const ratified = input.entries.filter((e) => e.status === "ratified");
  const ids = new Map<string, string>();
  const line = (e: DocumentEntry, i: number) => {
    const id = `e${i + 1}`;
    ids.set(id, e.id);
    return { id, section: e.section, text: e.text, mark: e.mark };
  };
  const all = ratified.map(line);
  return {
    input: {
      person_name: input.personName,
      constitution: all.filter((_, i) => ratified[i].document === "constitution"),
      history: all.filter((_, i) => ratified[i].document === "history"),
      turns: modelTurns(input.turns),
    },
    entryIdOf: (shortId: string) => ids.get(shortId) ?? null,
  };
}

/** Shown if the model's output is rejected twice, so a conversation never dead-ends. */
export const BIOGRAPHER_FALLBACK = { reflection: "", question: "Can you tell me a bit more about that, maybe a specific time it happened?", why: "I'd like to understand this better before moving on.", kind: "follow_up" as const };
export const MENTOR_FALLBACK = "I'm not sure how I'd put this one. Can you tell me a bit more about what happened?";
