/**
 * How a person writes (docs/concept_voice.md). Pure functions: keeping only the owner's side of a
 * pasted conversation, choosing which samples an avatar is shown, and counting what can be counted.
 * Samples teach an avatar manner, never matter: only ratified lines say what is true of a person.
 */

export const REGISTERS = ["considered", "everyday", "heated", "long_form", "spoken"] as const;
export type Register = (typeof REGISTERS)[number];
/** Registers a person can paste. "considered" is what they write to the biographer, collected as they go. */
export const PASTED_REGISTERS = ["everyday", "heated", "long_form", "spoken"] as const satisfies readonly Register[];

export const REGISTER_TITLES: Record<Register, string> = {
  considered: "What you wrote to your biographer",
  everyday: "Everyday messages",
  heated: "Messages from an argument",
  long_form: "Something longer you wrote",
  spoken: "Something you said out loud, written down",
};

export const REGISTER_HINTS: Record<(typeof PASTED_REGISTERS)[number], string> = {
  everyday: "Ordinary texts to your partner or anyone close. Twenty or so is plenty.",
  heated: "Your side of a real argument. Used only when a version of you is running on empty, never for the you that is one notch ahead, and never shown or quoted to anyone.",
  long_form: "An email, a letter, a post. Anything you wrote with time to think.",
  spoken: "A voice memo typed out, or a transcript. The only source for how you talk.",
};

// ---------------------------------------------------------------- whose words are these?
// [12/03/2024, 21:14:07] Ana: text   |   12/03/2024, 21:14 - Ana: text   |   Ana: text
const STAMPED = /^\s*\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?\]?\s*(?:-\s*)?([^:\n]{1,40}?):\s?(.*)$/i;
const NAMED = /^\s*([A-Z][\p{L}'’.-]{0,20}(?: [A-Z][\p{L}'’.-]{0,20}){0,2}):\s(.*)$/u;

export type SpokenLine = { speaker: string | null; text: string };

/** Split pasted text into lines with their speaker, where the paste says who is speaking. */
export function splitSpeakers(text: string): { speakers: string[]; lines: SpokenLine[]; format: "export" | "names" | null } {
  const raw = text.replace(/\r\n?/g, "\n").replace(/[\u200e\u200f\u202a-\u202e]/g, "").split("\n");
  const stamped = raw.filter((l) => STAMPED.test(l)).length;
  const pattern = stamped >= 2 ? STAMPED : NAMED;
  const lines: SpokenLine[] = [];
  for (const l of raw) {
    const m = pattern.exec(l);
    if (m) lines.push({ speaker: m[1].trim(), text: m[2] });
    else if (lines.length && l.trim()) lines[lines.length - 1].text += `\n${l}`;
    else if (l.trim()) lines.push({ speaker: null, text: l });
  }
  const counts = new Map<string, number>();
  for (const l of lines) if (l.speaker) counts.set(l.speaker, (counts.get(l.speaker) ?? 0) + 1);
  // One "Name: …" line in an essay is a sentence with a colon in it, not a conversation.
  const speakers = [...counts].filter(([, n]) => n >= 2 || stamped >= 2).map(([s]) => s);
  if (speakers.length < 2) return { speakers: [], lines: [{ speaker: null, text: text.trim() }], format: null };
  // A chat export with timestamps is certainly a conversation. Bare "Name: …" lines only probably are.
  return { speakers, lines: lines.map((l) => (l.speaker && !speakers.includes(l.speaker) ? { speaker: null, text: `${l.speaker}: ${l.text}` } : l)), format: stamped >= 2 ? "export" : "names" };
}

/** Only the owner's side survives. The other person's words are theirs, and are never stored. */
export function keepOnly(text: string, speaker: string): string {
  return splitSpeakers(text)
    .lines.filter((l) => l.speaker === speaker)
    .map((l) => l.text.trim())
    .filter((t) => t && !/^<[^>]*omitted>$/i.test(t))
    .join("\n");
}

// ---------------------------------------------------------------- what an avatar is shown
export type VoiceSample = { register: Register; text: string };
export type Correction = { said: string; wouldSay: string };

const HEATED_ONLY_FOR = new Set(["depleted"]);

/**
 * The one-notch-ahead self is the person at their best, so it never learns from their worst
 * texts. Only a version that is running on empty may see the heated register.
 */
export function registersFor(avatar: "mentor" | "rehearsal" | { version: string }): Register[] {
  // A replayed argument is an argument: the avatar of record needs to know how its person sounds in one.
  const heated = avatar === "rehearsal" || (avatar !== "mentor" && HEATED_ONLY_FOR.has(avatar.version));
  return REGISTERS.filter((r) => r !== "heated" || heated);
}

const clip = (text: string, maxWords: number) => {
  const words = text.trim().split(/\s+/);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}…`;
};

export const VOICE_BUDGET = { samples: 14, sampleWords: 70, corrections: 6, correctionWords: 60 };

/**
 * A small, even-handed sample: registers take turns, newest first within each, so one long paste
 * cannot crowd out the rest. Deterministic, so the same inputs give the same request.
 */
export function buildVoiceInput(input: { samples: VoiceSample[]; corrections: Correction[]; registers: Register[] }) {
  const byRegister = input.registers.map((r) => input.samples.filter((s) => s.register === r && s.text.trim().split(/\s+/).length >= 3));
  const picked: VoiceSample[] = [];
  for (let i = 0; picked.length < VOICE_BUDGET.samples && byRegister.some((list) => i < list.length); i++) {
    for (const list of byRegister) if (i < list.length && picked.length < VOICE_BUDGET.samples) picked.push(list[i]);
  }
  return {
    samples: picked.map((s) => ({ register: s.register, text: clip(s.text, VOICE_BUDGET.sampleWords) })),
    corrections: input.corrections.slice(0, VOICE_BUDGET.corrections).map((c) => ({ avatar_said: clip(c.said, VOICE_BUDGET.correctionWords), they_would_say: clip(c.wouldSay, VOICE_BUDGET.correctionWords) })),
  };
}

export const EMPTY_VOICE = { samples: [] as Array<{ register: Register; text: string }>, corrections: [] as Array<{ avatar_said: string; they_would_say: string }> };

// ---------------------------------------------------------------- what can be counted
export type VoiceStats = { words: number; sentences: number; medianSentenceWords: number; questionsPer100: number; exclamationsPer100: number; emojiPer100Words: number; lowercaseStarts: number; ellipsesPer100: number };

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/** Counts only. Nothing here says what kind of person writes this way. */
export function voiceStats(texts: string[]): VoiceStats {
  const all = texts.join("\n");
  const sentences = all
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));
  const words = all.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w)).length;
  const per100 = (n: number) => (sentences.length ? Math.round((n / sentences.length) * 100) : 0);
  const messages = texts.flatMap((t) => t.split(/\n+/)).filter((m) => /\p{L}/u.test(m));
  return {
    words,
    sentences: sentences.length,
    medianSentenceWords: median(sentences.map((s) => s.split(/\s+/).length)),
    questionsPer100: per100(sentences.filter((s) => s.endsWith("?")).length),
    exclamationsPer100: per100(sentences.filter((s) => s.endsWith("!")).length),
    emojiPer100Words: words ? Math.round(((all.match(/\p{Extended_Pictographic}/gu) ?? []).length / words) * 1000) / 10 : 0,
    lowercaseStarts: messages.length ? Math.round((messages.filter((m) => /^\p{Ll}/u.test(m.trim())).length / messages.length) * 100) : 0,
    ellipsesPer100: per100((all.match(/\.{3}|…/g) ?? []).length),
  };
}
