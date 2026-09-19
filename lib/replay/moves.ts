/**
 * The shape of an argument, as a sequence of moves. A replay crosses the boundary between two
 * people, so what crosses it is kept to this fixed list: each person reads their own avatar's
 * words, and only the move their partner's avatar made. Recognition is scored here, in code.
 */

export const MOVES = ["asks", "states_position", "explains", "criticizes", "defends", "owns", "appreciates", "proposes", "agrees", "disagrees", "withdraws", "deflects", "pauses", "leaves", "other"] as const;
export type Move = (typeof MOVES)[number];

/** What an avatar did, read off a timeline. */
export const MOVE_DID: Record<Move, string> = {
  asks: "asked a question",
  states_position: "said what they wanted or thought",
  explains: "explained or justified",
  criticizes: "criticized or blamed",
  defends: "defended, or complained back",
  owns: "owned up or apologized",
  appreciates: "reassured or appreciated",
  proposes: "proposed something",
  agrees: "agreed",
  disagrees: "disagreed or refused",
  withdraws: "went quiet or pulled back",
  deflects: "changed the subject or joked it off",
  pauses: "asked for a pause",
  leaves: "ended it or left",
  other: "did something else",
};

/** The same list as a person ticks it, for themselves and for their partner. "other" is never offered. */
export const REMEMBERED_MOVES = MOVES.filter((m) => m !== "other");
export const MOVE_I: Record<Exclude<Move, "other">, string> = {
  asks: "I asked questions",
  states_position: "I said what I wanted or thought",
  explains: "I explained or justified myself",
  criticizes: "I criticized or blamed",
  defends: "I defended myself, or complained back",
  owns: "I owned up or apologized",
  appreciates: "I reassured or appreciated",
  proposes: "I proposed something",
  agrees: "I agreed",
  disagrees: "I disagreed or refused",
  withdraws: "I went quiet or pulled back",
  deflects: "I changed the subject or joked it off",
  pauses: "I asked for a pause",
  leaves: "I ended it or left",
};
export const MOVE_THEY: Record<Exclude<Move, "other">, string> = {
  asks: "asked questions",
  states_position: "said what they wanted or thought",
  explains: "explained or justified themselves",
  criticizes: "criticized or blamed",
  defends: "defended themselves, or complained back",
  owns: "owned up or apologized",
  appreciates: "reassured or appreciated",
  proposes: "proposed something",
  agrees: "agreed",
  disagrees: "disagreed or refused",
  withdraws: "went quiet or pulled back",
  deflects: "changed the subject or joked it off",
  pauses: "asked for a pause",
  leaves: "ended it or left",
};

export const ENDINGS = ["unresolved", "one_left", "escalated", "repaired", "agreed"] as const;
export type Ending = (typeof ENDINGS)[number];
export const ENDING_WORDS: Record<Ending, string> = {
  unresolved: "It stopped without anything being settled",
  one_left: "One of us left or went quiet, and that was that",
  escalated: "It got worse until something broke it off",
  repaired: "One of us reached out and it softened",
  agreed: "We agreed on something",
};

export type CodedTurn = { speaker: string; move: Move; secondary?: Move | null; remembered?: boolean };

/**
 * Moves a person and a coder will not reliably tell apart. "I explained myself" and "defended" are
 * the same act seen from inside and from outside; so are going quiet and walking out. For
 * recognition they count as one, or the score would punish a difference in wording.
 */
const FAMILY: Partial<Record<Move, string>> = { explains: "justifies", defends: "justifies", withdraws: "pulls_away", leaves: "pulls_away" };
const familyOf = (m: Move) => FAMILY[m] ?? m;

/**
 * How a replay ended, read from its last moves. Code, not a model: the person sets this beside how
 * they remember the real one ending.
 */
export function endingOf(turns: CodedTurn[]): Ending {
  const last = turns.slice(-4).map((t) => t.move);
  const final = last[last.length - 1];
  if (!final) return "unresolved";
  if (final === "leaves" || final === "withdraws" || (last.slice(-2).length === 2 && last.slice(-2).every((m) => m === "withdraws" || m === "pauses"))) return "one_left";
  if (last.slice(-2).includes("agrees") && last.some((m) => m === "proposes" || m === "agrees")) return "agreed";
  if (last.slice(-2).some((m) => m === "owns" || m === "appreciates")) return "repaired";
  if (last.filter((m) => m === "criticizes" || m === "defends").length >= 3) return "escalated";
  return "unresolved";
}

export type Recognition = { matched: Move[]; onlyRemembered: Move[]; onlyAvatar: Move[]; overlap: number };

/**
 * A remembered set of moves against the moves an avatar made. Order is ignored on purpose: people
 * remember what they did in an argument far better than when. The opening line came from the
 * couple's own memory, so it says nothing about the avatar and is left out.
 */
export function recognition(remembered: Move[], turns: CodedTurn[], speaker: string): Recognition {
  const mine = new Set<Move>(remembered.filter((m) => m !== "other"));
  // A turn that does two things counts for both.
  const avatar = new Set<Move>(turns.filter((t) => t.speaker === speaker && !t.remembered).flatMap((t) => [t.move, ...(t.secondary ? [t.secondary] : [])]).filter((m) => m !== "other"));
  const mineFamilies = new Set([...mine].map(familyOf));
  const avatarFamilies = new Set([...avatar].map(familyOf));
  const matched = MOVES.filter((m) => mine.has(m) && avatarFamilies.has(familyOf(m)));
  const onlyRemembered = MOVES.filter((m) => mine.has(m) && !avatarFamilies.has(familyOf(m)));
  const onlyAvatar = MOVES.filter((m) => avatar.has(m) && !mineFamilies.has(familyOf(m)));
  const union = new Set([...mineFamilies, ...avatarFamilies]).size;
  const shared = [...mineFamilies].filter((f) => avatarFamilies.has(f)).length;
  return { matched, onlyRemembered, onlyAvatar, overlap: union ? shared / union : 0 };
}

/** Model agents agree too easily. A replay of a real argument that is all agreement by its fourth turn has not replayed it. */
export function resolvedTooEasily(turns: CodedTurn[]): boolean {
  const generated = turns.filter((t) => !t.remembered).slice(0, 4);
  return generated.length >= 3 && generated.filter((t) => t.move === "agrees" || t.move === "owns" || t.move === "appreciates").length >= 3;
}
