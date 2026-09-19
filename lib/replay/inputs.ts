/**
 * What a rehearsal avatar is shown in a replay of a remembered argument. It gets its owner's
 * non-private lines, how they write, the scene both people agreed to start from, and the state
 * its owner says they were in. It is never shown what its owner remembers doing: that is the
 * answer the replay is being tested against.
 */
import type { DocumentEntry } from "@/lib/data/biographer";
import { EMPTY_VOICE } from "@/lib/biographer/voice";
import { ENDINGS, REMEMBERED_MOVES, type Ending, type Move } from "@/lib/replay/moves";

export type Frame = { label: string; setting: string; firstSpeaker: "proposer" | "partner"; openingLine: string };
export type Account = { stateBefore: string; myMoves: Move[]; theirMoves: Move[]; ending: Ending; notes: string };

export const REPLAY_LIMITS = { maxTurns: 12, minLines: 5, silentTurnsToStop: 2 };

/**
 * With another person's avatar in the room, a private line is not used at all. "avatar_only"
 * lines shape what the avatar does and are never said; "shareable" lines may be said.
 */
export function rehearsalEntries(entries: DocumentEntry[]): DocumentEntry[] {
  return entries.filter((e) => e.status === "ratified" && e.tier !== "private");
}

export function rehearsalReadiness(entries: DocumentEntry[]) {
  const usable = rehearsalEntries(entries);
  const constitution = usable.filter((e) => e.document === "constitution").length;
  const ratified = entries.filter((e) => e.status === "ratified").length;
  return { ready: constitution >= REPLAY_LIMITS.minLines, usable: usable.length, constitution, ratified, needed: REPLAY_LIMITS.minLines };
}

export type SpokenTurn = { speakerId: string; says: string | null; does: string | null };

export function buildRehearsalInput(input: {
  me: { id: string; name: string };
  partnerName: string;
  entries: DocumentEntry[];
  voice?: typeof EMPTY_VOICE;
  frame: Frame;
  stateBefore: string;
  /** What the person has told their own avatar while watching it: first-person notes on how they act in a moment like this. */
  coaching?: string[];
  turns: SpokenTurn[];
  maxTurns?: number;
}) {
  const usable = rehearsalEntries(input.entries);
  const ids = new Map<string, string>();
  const all = usable.map((e, i) => {
    const id = `e${i + 1}`;
    ids.set(id, e.id);
    return { id, section: e.section, text: e.text, mark: e.mark, may_say: e.tier === "shareable" };
  });
  const max = input.maxTurns ?? REPLAY_LIMITS.maxTurns;
  return {
    input: {
      you: input.me.name,
      partner: input.partnerName,
      constitution: all.filter((_, i) => usable[i].document === "constitution"),
      history: all.filter((_, i) => usable[i].document === "history"),
      voice: input.voice ?? EMPTY_VOICE,
      scene: { what_it_was_about: input.frame.label, where_and_when: input.frame.setting },
      your_state: input.stateBefore,
      in_moments_like_this: (input.coaching ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 6),
      so_far: input.turns.map((t) => ({ who: t.speakerId === input.me.id ? "you" : input.partnerName, says: t.says, does: t.does })),
      exchanges_left: Math.max(0, max - input.turns.length),
    },
    entryIdOf: (shortId: string) => ids.get(shortId) ?? null,
  };
}

/** The model sometimes wraps speech in quotation marks, or leaves one hanging. The page adds its own. */
export const cleanSpeech = (says: string | null | undefined) => says?.trim().replace(/^["\u201c\u201d]+|["\u201c\u201d]+$/g, "").trim() || null;

/** The move coder sees words and nothing about who the people are. */
export function buildMoveCoderInput(turns: SpokenTurn[], firstSpeakerId: string) {
  const name = (id: string) => (id === firstSpeakerId ? "A" : "B");
  const recent = turns.slice(-4);
  return { earlier: recent.slice(0, -1).map((t) => ({ speaker: name(t.speakerId), says: t.says, does: t.does })), turn_to_code: { speaker: name(recent[recent.length - 1].speakerId), says: recent[recent.length - 1].says, does: recent[recent.length - 1].does } };
}

/** Stop when someone ends it, when the turns run out, or when nobody has said anything for a while. */
export function replayIsOver(turns: Array<SpokenTurn & { ends: boolean }>, maxTurns = REPLAY_LIMITS.maxTurns): boolean {
  if (turns.length === 0) return false;
  if (turns[turns.length - 1].ends || turns.length >= maxTurns) return true;
  const tail = turns.slice(-REPLAY_LIMITS.silentTurnsToStop);
  return tail.length === REPLAY_LIMITS.silentTurnsToStop && tail.every((t) => !t.says?.trim());
}

export const nextSpeaker = (turns: Array<{ speakerId: string }>, participants: [string, string]) => (turns.length === 0 ? participants[0] : participants.find((p) => p !== turns[turns.length - 1].speakerId)!);

export function cleanAccount(raw: { stateBefore: string; myMoves: string[]; theirMoves: string[]; ending: string; notes?: string }): Account | null {
  const moves = (xs: string[]) => [...new Set(xs)].filter((m): m is Move => (REMEMBERED_MOVES as readonly string[]).includes(m));
  if (!(ENDINGS as readonly string[]).includes(raw.ending)) return null;
  const mine = moves(raw.myMoves);
  if (!raw.stateBefore.trim() || mine.length === 0) return null;
  return { stateBefore: raw.stateBefore.trim(), myMoves: mine, theirMoves: moves(raw.theirMoves), ending: raw.ending as Ending, notes: raw.notes?.trim() ?? "" };
}
