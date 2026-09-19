/** How a person writes: keeping only their side of a paste, choosing samples for an avatar, and counting. */
import { describe, expect, it } from "vitest";
import { buildVoiceInput, EMPTY_VOICE, keepOnly, registersFor, splitSpeakers, VOICE_BUDGET, voiceStats, type VoiceSample } from "@/lib/biographer/voice";
import { buildMentorInput } from "@/lib/biographer/inputs";
import { buildVersionInput, panelVersionsFor } from "@/lib/biographer/versions";
import type { DocumentEntry } from "@/lib/data/biographer";

const IOS = `[12/03/2024, 21:14:07] Ana Ruiz: are you still at work
[12/03/2024, 21:15:40] Ben: yes. sorry
[12/03/2024, 21:15:52] Ben: another hour i think
[12/03/2024, 21:16:03] Ana Ruiz: ok. dinner's in the oven
it'll keep
[12/03/2024, 21:20:11] Ben: <Media omitted>
[12/03/2024, 21:20:30] Ben: thank you`;
const ANDROID = `12/03/2024, 21:14 - Ana: are you still at work
12/03/2024, 21:15 - Ben: yes. sorry
12/03/2024, 21:16 - Ana: ok`;
const NAMES = `Ana: are you still at work
Ben: yes. sorry
Ana: ok. dinner's in the oven
Ben: thank you`;

describe("whose words are these", () => {
  it("reads both chat export formats and plain name prefixes, with a message that runs over two lines", () => {
    expect(splitSpeakers(IOS)).toMatchObject({ speakers: ["Ana Ruiz", "Ben"], format: "export" });
    expect(splitSpeakers(ANDROID)).toMatchObject({ speakers: ["Ana", "Ben"], format: "export" });
    expect(splitSpeakers(NAMES)).toMatchObject({ speakers: ["Ana", "Ben"], format: "names" });
    expect(splitSpeakers(IOS).lines.find((l) => l.text.startsWith("ok. dinner"))?.text).toBe("ok. dinner's in the oven\nit'll keep");
  });

  it("keeps only the owner's side, without names, timestamps or media placeholders", () => {
    const mine = keepOnly(IOS, "Ben");
    expect(mine).toBe("yes. sorry\nanother hour i think\nthank you");
    expect(mine).not.toMatch(/Ana|dinner|21:1|omitted/);
    expect(keepOnly(ANDROID, "Ana")).toBe("are you still at work\nok");
    // What is kept no longer reads as a conversation, so the server's second check passes it.
    expect(splitSpeakers(mine).speakers).toEqual([]);
    expect(keepOnly(IOS, "Nobody")).toBe("");
  });

  it("does not mistake an essay with a colon in it for a conversation", () => {
    const essay = "Dear all,\nNote: I will be away in March. The rest of this is a long paragraph about the allotment.\nWarning: the gate sticks.";
    expect(splitSpeakers(essay)).toEqual({ speakers: [], lines: [{ speaker: null, text: essay }], format: null });
  });
});

describe("which registers an avatar sees", () => {
  it("only the version running on empty is shown the heated register", () => {
    expect(registersFor("mentor")).not.toContain("heated");
    expect(registersFor({ version: "rested" })).not.toContain("heated");
    expect(registersFor({ version: "one_notch_ahead" })).not.toContain("heated");
    expect(registersFor({ version: "depleted" })).toContain("heated");
    expect(registersFor("mentor")).toEqual(["considered", "everyday", "long_form", "spoken"]);
  });
});

describe("buildVoiceInput", () => {
  const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const samples: VoiceSample[] = [
    ...Array.from({ length: 30 }, (_, i) => ({ register: "considered" as const, text: `considered answer number ${i} goes here` })),
    { register: "everyday", text: "on my way. ten mins" },
    { register: "everyday", text: long },
    { register: "heated", text: "fine. do what you want" },
    { register: "spoken", text: "ok" },
  ];

  it("takes registers in turn so one source cannot crowd out the rest, within a fixed budget", () => {
    const voice = buildVoiceInput({ samples, corrections: [], registers: registersFor("mentor") });
    expect(voice.samples).toHaveLength(VOICE_BUDGET.samples);
    expect(voice.samples.slice(0, 2).map((s) => s.register)).toEqual(["considered", "everyday"]);
    expect(voice.samples.filter((s) => s.register === "everyday")).toHaveLength(2);
    expect(voice.samples.some((s) => s.register === "heated")).toBe(false);
    // Too short to show any manner.
    expect(voice.samples.some((s) => s.text === "ok")).toBe(false);
    const clipped = voice.samples.find((s) => s.text.startsWith("word0"))!;
    expect(clipped.text.split(" ")).toHaveLength(VOICE_BUDGET.sampleWords);
    expect(clipped.text.endsWith("…")).toBe(true);
  });

  it("is deterministic, and hands the heated register to the one version allowed to see it", () => {
    const a = buildVoiceInput({ samples, corrections: [], registers: registersFor({ version: "depleted" }) });
    const b = buildVoiceInput({ samples, corrections: [], registers: registersFor({ version: "depleted" }) });
    expect(a).toEqual(b);
    expect(a.samples.map((s) => s.text)).toContain("fine. do what you want");
  });

  it("passes corrections as pairs, newest first, a handful at most", () => {
    const corrections = Array.from({ length: 9 }, (_, i) => ({ said: `What has helped me lately is asking first ${i}.`, wouldSay: `honestly? i just ask now ${i}` }));
    const voice = buildVoiceInput({ samples: [], corrections, registers: registersFor("mentor") });
    expect(voice.corrections).toHaveLength(VOICE_BUDGET.corrections);
    expect(voice.corrections[0]).toEqual({ avatar_said: "What has helped me lately is asking first 0.", they_would_say: "honestly? i just ask now 0" });
  });
});

describe("the avatars' inputs", () => {
  const entry = (id: string, section: string, text: string): DocumentEntry => ({ id, document: "constitution", section, text, status: "ratified", mark: "open", tier: "private", in_their_words: true, source_thread_id: null, source_turns: [], ratified_at: null, created_at: new Date(0) });
  const entries = [entry("a", "values", "Security comes first."), entry("b", "working_on", "Asking before I explain.")];

  it("carry the voice when there is one and an empty one when there is not", () => {
    const voice = buildVoiceInput({ samples: [{ register: "everyday", text: "on my way. ten mins" }], corrections: [], registers: registersFor("mentor") });
    expect(buildMentorInput({ personName: "Ben", entries, turns: [], voice }).input.voice).toEqual(voice);
    expect(buildMentorInput({ personName: "Ben", entries, turns: [] }).input.voice).toEqual(EMPTY_VOICE);
    const version = panelVersionsFor(entries)[0];
    expect(buildVersionInput({ personName: "Ben", entries, situation: "s", version, voice }).input.voice).toEqual(voice);
    expect(buildVersionInput({ personName: "Ben", entries, situation: "s", version }).input.voice).toEqual(EMPTY_VOICE);
  });
});

describe("voiceStats", () => {
  it("counts, and says nothing about the person", () => {
    const s = voiceStats(["on my way. ten mins", "did you eat? i can pick something up", "ok… fine", "Honestly that was a long day and I would rather not talk about it until tomorrow!"]);
    expect(s.sentences).toBe(7);
    expect(s.questionsPer100).toBe(14);
    expect(s.exclamationsPer100).toBe(14);
    expect(s.lowercaseStarts).toBe(75);
    expect(s.medianSentenceWords).toBe(3);
    expect(s.emojiPer100Words).toBe(0);
    expect(voiceStats(["so tired 😴😴", "yes 🙂"]).emojiPer100Words).toBeGreaterThan(0);
    expect(voiceStats([])).toMatchObject({ words: 0, sentences: 0, medianSentenceWords: 0 });
  });
});
