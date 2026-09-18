/**
 * Pure builders for the biographer, drafter and one-notch-ahead roles. They turn stored turns and
 * ratified lines into the JSON each role sees, using short ids ("t3", "e2") that are mapped back
 * afterwards, so no database id reaches a prompt.
 */
import biographerConfig from "@/config/biographer.json";
import type { z } from "zod";
import { BiographerTurnSchema, DOCUMENT_SECTIONS, sectionBelongsTo, type BiographerTurn, type DrafterOutput } from "@/lib/llm/schemas";
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

export type Depth = "light" | "deeper";

/** Answers this short that also read as a refusal are not pushed on a second time. */
const DECLINED = /\b(not really|don'?t know|dunno|idk|no idea|nothing( really)?|can'?t (remember|recall|say)|rather not|pass|skip|it was (normal|fine)|no)\b/i;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Facts about how this person answers, computed so the model does not have to guess. */
export function answerProfile(turns: Array<Pick<Turn, "role" | "text">>) {
  const counts = turns.filter((t) => t.role === "person").map((t) => words(t.text));
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const lastPerson = [...turns].reverse().find((t) => t.role === "person");
  const last = lastPerson ? words(lastPerson.text) : 0;
  return { answers: counts.length, median_words: median, last_words: last, declined_last: !!lastPerson && last <= 8 && DECLINED.test(lastPerson.text) };
}

/** Under this median, a person counts as answering briefly. The prompt uses the same number. */
export const BRIEF_MEDIAN_WORDS = 15;

/**
 * Places to start are for people who answer briefly or have just declined. For anyone else they
 * narrow an answer that was going to be fuller without them, so the app does not show them.
 */
export function optionsFor(profile: ReturnType<typeof answerProfile>, options: string[]): string[] {
  const brief = profile.answers > 0 && (profile.median_words < BRIEF_MEDIAN_WORDS || profile.declined_last);
  return brief ? options.map((o) => o.trim()).filter(Boolean).slice(0, 4) : [];
}

/**
 * The running list of things mentioned and not yet explored. The biographer returns the whole
 * list each turn, so the newest guide turn that carries one is the current state; a fallback
 * question carries none and leaves the list as it was.
 */
export function threadsToReturnTo(turns: Turn[], limit = 6): string[] {
  const latest = [...turns].reverse().find((t) => t.role === "guide" && t.extras !== null);
  const seen = new Set<string>();
  return (latest?.extras?.threads ?? [])
    .map((label) => label.trim())
    .filter((label) => label && !seen.has(label.toLowerCase()) && !!seen.add(label.toLowerCase()))
    .slice(0, limit);
}

export function buildBiographerInput(input: { personName: string; focus: Focus; turns: Turn[]; entries: DocumentEntry[]; openQuestions: string[]; depth?: Depth }) {
  // Turns the app wrote for a later session are not part of this conversation.
  const spoken = input.turns.filter((t) => t.meta.kind !== "next_time");
  return {
    person_name: input.personName,
    focus: { key: input.focus.key, title: input.focus.title, about: input.focus.about },
    depth: input.depth ?? "light",
    turns: modelTurns(spoken),
    answer_profile: answerProfile(spoken),
    threads_to_return_to: threadsToReturnTo(spoken),
    ratified: ratifiedLines(input.entries),
    open_questions: input.openQuestions.slice(0, 5),
  };
}

/** Engage before you evoke: no side-by-side question until the person has given three answers. */
export const ANSWERS_BEFORE_DISCREPANCY = 3;

export function biographerTurnSchemaFor(input: { answers: number; depth: Depth }): z.ZodType<BiographerTurn> {
  return BiographerTurnSchema.superRefine((t, ctx) => {
    if (t.kind === "discrepancy" && input.depth === "light") {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "the person chose to keep this conversation light; do not place two things side by side, in the reflection or the question. Ask about what happened or what they did." });
    } else if (t.kind === "discrepancy" && input.answers < ANSWERS_BEFORE_DISCREPANCY) {
      ctx.addIssue({ code: "custom", path: ["kind"], message: `the person has given ${input.answers} answer(s); do not place two things side by side before ${ANSWERS_BEFORE_DISCREPANCY}, in the reflection or the question. Ask a question that only seeks to understand, and keep the rest as threads.` });
    }
  });
}

export function buildDrafterInput(input: { personName: string; focus: Focus; turns: Turn[]; entries: DocumentEntry[] }) {
  const ratified = input.entries.filter((e) => e.status === "ratified");
  const coverage = Object.fromEntries(DOCUMENT_SECTIONS.map((s) => [s, ratified.filter((e) => e.section === s).length]));
  return {
    person_name: input.personName,
    focus: { key: input.focus.key, title: input.focus.title, about: input.focus.about },
    turns: modelTurns(input.turns.filter((t) => t.meta.kind !== "next_time")),
    already_ratified: ratifiedLines(input.entries),
    coverage,
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
export function cleanReferences(turn: Pick<BiographerTurn, "references">, turns: Turn[]): number[] {
  const seqs = new Set(turns.map((t) => t.seq));
  return [...new Set(turn.references.map(seqOfTurnId).filter((n): n is number => n !== null && seqs.has(n)))];
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
export const BIOGRAPHER_FALLBACK = { reflection: "", question: "Can you tell me a bit more about that, maybe a specific time it happened?", why: "I'd like to understand this better before moving on.", kind: "follow_up" as const, aim: "moment" as const, options: [] as string[], threads: [] as string[] };
export const MENTOR_FALLBACK = "I'm not sure how I'd put this one. Can you tell me a bit more about what happened?";
