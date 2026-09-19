/**
 * The bones of two invented lives, drawn in code and handed to the writers as givens.
 *
 * Left to itself the model writes the same life every time. In eight couples written from different
 * outlines, six of sixteen histories had money "counted out loud at the kitchen table", most houses
 * were terraced, affection was always "practical", nearly everyone "goes quiet" when pressed and
 * says "it's fine" when it isn't, and the thing the couple argues about (money, say) became the key
 * to both childhoods. Names had the same problem and the same cure: a draw from a list has no
 * favourites. The model still does the writing; it no longer chooses the skeleton.
 *
 * Everything here is behaviour and circumstance, never a trait or a diagnosis, and nothing here
 * involves violence, abuse, coercion or self-harm.
 */
import type { Draw } from "@/lib/sandbox/names";

const HOUSEHOLD = [
  "the only child of a mother who worked two jobs",
  "the youngest of six, on a farm",
  "a forces family that moved every two or three years",
  "brought up mostly by grandparents while the parents worked away",
  "comfortably off, both parents professionals, sent away to school at eleven",
  "parents who split up loudly when they were nine, and two homes after that",
  "a house always full of cousins, lodgers and whoever needed a bed",
  "a religious household, with worship several times a week",
  "a family business that the children worked in from the age of ten",
  "a father who was ill for most of their childhood, and a mother who held it together",
  "the eldest, who half-raised the younger ones",
  "a twin",
  "adopted as a baby, and always told so",
  "a stepfamily from the age of seven, with step-siblings they are still not close to",
  "parents who were much older than everyone else's",
  "a father who worked abroad and came home four times a year",
  "a family whose money ran out suddenly when they were fourteen",
  "the only child of two teachers",
  "the middle one of five, easy to overlook",
  "a mother who had them at seventeen and grew up alongside them",
  "a well-known family in a small place, where everyone knew their business",
  "a parent who drank, and has now been sober for many years",
  "a brother or sister with a disability, around whom the house was organised",
  "parents who adored each other and rather left the children to it",
] as const;

const AIR_IN_THE_HOUSE = [
  "rows were loud, frequent and over in ten minutes, and nobody held a grudge",
  "nothing was ever argued about out loud; you could only tell from who was not speaking to whom",
  "everyone was teased, constantly, and teasing was how you knew you were loved",
  "lots of hugging, lots of tears, and no privacy at all",
  "praise was for results, and came with the next target attached",
  "one parent's mood set the weather, and everyone learned to read it from the hall",
  "disagreeing was treated as bad manners, so everyone was pleasant and nobody said much",
  "the parents bickered all day and were plainly devoted to each other",
  "their mother told them everything, including things a child should not have to hold",
  "feelings were talked about at length, at the table, whether you wanted to or not",
  "affection was food: what was cooked, for whom, and who got seconds",
  "jokes did all the work; nobody could say a serious thing without a punchline",
  "they were the favourite, and knew it, and so did the others",
  "they were the one who caused trouble, and the part stuck long after they stopped",
  "apologies were demanded and performed; meaning them was optional",
  "everyone was very busy, very kind, and hardly ever in the same room",
  "money was never mentioned, and they had no idea whether the family had any",
  "there was singing, shouting and slammed doors, and then everyone ate together as usual",
] as const;

const TURNING_POINT = [
  "a parent died when they were in their early twenties",
  "they were left, without warning, by someone they had been with for years",
  "they ended a long relationship themselves and have never been sure it was right",
  "a business of theirs failed and took the savings with it",
  "they moved countries alone in their twenties",
  "they spent several years looking after a dying parent",
  "they dropped out of a degree and have never told people the real reason",
  "they drank heavily for some years, and stopped",
  "a serious illness in their thirties, from which they recovered",
  "they lost the faith they were brought up in",
  "they found religion as an adult",
  "they were cheated on in an earlier relationship and found out from someone else",
  "they cheated in an earlier relationship, and it ended because of it",
  "they were made redundant from a job they had built themselves around",
  "they had a child very young",
  "a close friendship ended badly and they still think about it",
  "they were the first in their family to go to university, and came back different",
  "they served in the armed forces for some years",
  "a pregnancy that was lost, before this relationship or early in it",
  "years of being broke in their twenties that they do not talk about",
  "they gave up something they were seriously good at: a sport, an instrument, a trade",
  "an earlier marriage that was pleasant and empty, and ended politely",
  "a brother or sister they no longer speak to",
  "a stretch of real success that ended, and which they measure everything against",
] as const;

const IN_A_DISAGREEMENT = [
  "gets loud quickly, says too much, and is over it in ten minutes",
  "makes a joke, then another, until the other person gives up or blows up",
  "agrees at once to end it, and then does what they were going to do anyway",
  "asks questions like a cross-examination until the other person contradicts themselves",
  "cries, hates that they cry, and gets angrier because of it",
  "goes formal and polite: full sentences, the other person's full name",
  "brings up the last three times this happened, with dates",
  "walks out of the house and comes back when they are ready",
  "cannot leave it: follows from room to room until it is sorted, however late it is",
  "gets sarcastic, and is good at it",
  "goes silent and busy: tidying, the phone, anything to do with their hands",
  "tries to fix it at once with a plan, before the other person has finished speaking",
  "says sorry immediately, for everything, which ends nothing",
  "turns it round to something the other person did",
  "explains, at length, and then explains again in different words",
  "laughs at the wrong moment, out of nerves, which makes everything worse",
  "says little in the room and sends a long message later",
  "gets very calm and very reasonable, in a way that feels like being handled",
] as const;

const AFTERWARDS = [
  "is back to normal within the hour, and baffled that the other is not",
  "needs a full day and cannot be hurried",
  "never says sorry but does something: a meal, a mended shelf, the car filled up",
  "apologises properly and in detail, and expects the same back",
  "wants to talk the whole thing through the same night, however late",
  "acts as though nothing happened and hopes it holds",
  "makes a joke at their own expense as a peace offering",
  "waits for the other to come to them, every time",
  "reaches for touch first, and words later if at all",
  "writes it down, a note or a message, because they say it better on paper",
  "replays it for days and brings back the one sentence that stung",
  "buys something small and leaves it where it will be found",
] as const;

const HOW_THEY_TALK = [
  "long looping sentences that reach the point eventually, usually by way of a story",
  "swears cheerfully and constantly",
  "exact, slightly pedantic; corrects small facts even in the middle of an argument",
  "nicknames and teasing; says serious things as jokes",
  "few words, long pauses, and a shrug that does a lot of work",
  "fast; interrupts and finishes other people's sentences",
  "asks questions rather than saying what they think",
  "work language leaks in: agendas, action points, 'going forward'",
  "has two languages and goes back to the first one when upset",
  "very polite when angry: 'with respect', 'I'm sure you didn't mean'",
  "laughs when nervous, and talks more the less sure they are",
  "blunt, no padding, and surprised when it lands hard",
  "understates everything: a disaster is 'not ideal'",
  "quotes other people, their mother, a colleague, something they read, instead of saying 'I think'",
  "starts sentences and abandons them; the other person is expected to know the rest",
  "warm and wordy, 'love' and 'darling' even in a row",
  "sounds certain about everything, including things they decided a minute ago",
  "plain and slow; says a thing once and does not repeat it",
] as const;

const AFRAID_OF = [
  "being left",
  "being a burden",
  "turning into one of their parents",
  "being found out as less capable than people think",
  "being told what to do",
  "being poor again",
  "a small life: that this is all there is going to be",
  "being laughed at",
  "being wanted for what they do and not for who they are",
  "getting ill and needing to be looked after",
  "not mattering much to anyone",
  "being the one who cares more",
  "losing their temper and saying something that cannot be taken back",
  "being ordinary",
  "being lied to",
  "having left something too late",
  "being alone when they are old",
  "that their partner settled for them",
] as const;

const NEVER_TOLD = [
  "money: something earned, spent, owed or put aside",
  "someone from before this relationship",
  "a doubt about a big decision the two of them made together",
  "something about their health",
  "something they did long ago and are ashamed of",
  "something about their partner's family",
  "an ambition they have quietly put away",
  "something they noticed about their partner and have never mentioned",
  "someone they are still in touch with",
  "how close they once came to leaving",
  "something at work: trouble, an offer, a failure",
  "a belief of theirs that has changed, about faith, children or politics",
  "something a relative told them in confidence",
  "something they do when they are alone in the house",
] as const;

const FROM = [
  "grew up within an hour of where they live now",
  "grew up in another part of the same country",
  "grew up in another part of the same country",
  "came from another country as a child",
  "came from another country as an adult",
  "grew up here; their parents came from somewhere else",
] as const;

/** How the notes are laid out and in whose voice. Without this, every history has the same seven paragraphs in the same order. */
const OPEN_WITH = [
  "a recent scene that shows them as they are now",
  "their work, and what it has done to them",
  "a sentence they say often",
  "something they own and would not part with",
  "how they argue",
  "the house they grew up in",
  "what they are afraid of",
  "how they talk",
  "the turning point",
  "what their partner would say about them, and what that leaves out",
] as const;

const NOTE_TAKER = [
  "brisk, in short paragraphs, the way someone writes between appointments",
  "unhurried and fond, with an eye for small detail",
  "dry and observant",
  "plain and careful, never guessing past what was said in the room",
  "vivid, and keeps quoting the person's own phrases",
] as const;

const MET = [
  "through work",
  "on a dating app",
  "at school as teenagers, though they did not get together until years later",
  "as neighbours",
  "through a brother or sister",
  "at an evening class",
  "at a funeral",
  "on the same commute",
  "in a hospital waiting room",
  "through their place of worship",
  "in a shared house",
  "while one of them was going out with the other's friend",
  "on holiday",
  "at a sports club",
  "one was the other's customer",
  "online, arguing about something they both cared about",
  "at a protest",
  "in a quiz team",
  "through a lonely-hearts advert or an introduction by family",
  "when one of them rented a room from the other",
] as const;

const GOOD_THING = [
  "they make each other laugh, properly, most days",
  "they are very good in a crisis together",
  "the sex is good and always has been",
  "they like the same music, films and books, and argue about them happily",
  "they walk everywhere together and talk best side by side",
  "they cook and eat well together",
  "they are a good team on practical things",
  "they share a faith",
  "they are building something together: a house, a garden, a business",
  "each is the other's best audience: everything that happened in the day gets told",
  "they are gentle with each other's families",
  "they are physically easy with each other: always touching, feet in laps",
  "they are proud of each other's work and say so",
  "they travel well together",
] as const;

const REMEMBERED_DIFFERENTLY = [
  "a holiday that went wrong",
  "the night one of them nearly left",
  "whose idea it was to live where they live",
  "a party where one of them said something",
  "the week one of their parents died",
  "a job one of them turned down",
  "the first time one met the other's family",
  "a stay in hospital",
  "how they got together in the first place",
  "a big purchase",
  "an argument in front of friends",
  "the months one of them was out of work",
] as const;

const AGE_GAP = [0, 0, 1, 2, 2, 3, 4, 6, 9, 14] as const;

export type LifeGivens = {
  age: number;
  from: string;
  household: string;
  air_in_that_house: string;
  turning_point: string;
  in_a_disagreement: string;
  afterwards: string;
  how_they_talk: string;
  afraid_of: string;
  never_told_is_about: string;
};
export type NotesForm = { open_with: string; note_taker: string };
export type CoupleGivens = { met: string; good_thing: string; remembered_differently: string };
export type Lives = { couple: CoupleGivens; a: LifeGivens; b: LifeGivens; forms: { a: NotesForm; b: NotesForm } };

/** Two different items from one list, so the two people never get the same given. */
function pair<T>(list: readonly T[], draw: Draw): [T, T] {
  const first = list[draw(list.length)];
  const rest = list.filter((x) => x !== first);
  return [first, rest[draw(rest.length)]];
}

/**
 * Years together, read from the seed where it says ("Together eleven years", "married 26 years"),
 * so nobody is drawn younger than their own relationship allows. Null when the seed does not say.
 */
export function yearsTogether(seed: string): number | null {
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, eighteen: 18, nineteen: 19, twenty: 20, "twenty-five": 25, "twenty-six": 26, thirty: 30, forty: 40 };
  const m = /\b(\d{1,2}|[a-z]+(?:-[a-z]+)?)\s+(years|months)\b/i.exec(seed);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()];
  if (n === undefined) return null;
  return m[2].toLowerCase() === "months" ? Math.ceil(n / 12) : n;
}

/** The youngest either of them can be, given what the seed says about years together and children. */
export function youngestFor(seed: string): number {
  const together = yearsTogether(seed) ?? 0;
  const children = /\bgrown(-up)? (children|kids|son|daughter)|\bgrandchild/i.test(seed) ? 46 : /\bteenage/i.test(seed) ? 36 : 0;
  // Old enough to have met as adults.
  return Math.max(24, 21 + together, children);
}

export function drawLives(input: { seed: string; draw: Draw }): Lives {
  const { draw } = input;
  const youngest = youngestFor(input.seed);
  const ageA = youngest + draw(Math.max(6, 62 - youngest));
  const gap = AGE_GAP[draw(AGE_GAP.length)];
  const ageB = Math.max(youngest, draw(2) === 0 ? ageA + gap : ageA - gap);
  const lists = { household: pair(HOUSEHOLD, draw), air: pair(AIR_IN_THE_HOUSE, draw), turning: pair(TURNING_POINT, draw), fight: pair(IN_A_DISAGREEMENT, draw), after: pair(AFTERWARDS, draw), talk: pair(HOW_THEY_TALK, draw), fear: pair(AFRAID_OF, draw), untold: pair(NEVER_TOLD, draw), open: pair(OPEN_WITH, draw), voice: pair(NOTE_TAKER, draw) };
  const life = (i: 0 | 1, age: number): LifeGivens => ({
    age,
    from: FROM[draw(FROM.length)],
    household: lists.household[i],
    air_in_that_house: lists.air[i],
    turning_point: lists.turning[i],
    in_a_disagreement: lists.fight[i],
    afterwards: lists.after[i],
    how_they_talk: lists.talk[i],
    afraid_of: lists.fear[i],
    never_told_is_about: lists.untold[i],
  });
  return {
    couple: { met: MET[draw(MET.length)], good_thing: GOOD_THING[draw(GOOD_THING.length)], remembered_differently: REMEMBERED_DIFFERENTLY[draw(REMEMBERED_DIFFERENTLY.length)] },
    a: life(0, ageA),
    b: life(1, ageB),
    forms: { a: { open_with: lists.open[0], note_taker: lists.voice[0] }, b: { open_with: lists.open[1], note_taker: lists.voice[1] } },
  };
}

/** What the couple writer may know of one person: what a friend of the couple would know. The fear and the untold thing stay with that person's own writer. */
export function publicGivens(life: LifeGivens) {
  return { age: life.age, from: life.from, household: life.household, in_a_disagreement: life.in_a_disagreement, afterwards: life.afterwards, how_they_talk: life.how_they_talk };
}

/** One line for the person setting up the sandbox, so they can see where a life came from. */
export function describeGivens(life: LifeGivens): string {
  return `${life.age}; ${life.from}; ${life.household}; at home, ${life.air_in_that_house}. Turning point: ${life.turning_point}. In a disagreement, ${life.in_a_disagreement}; afterwards, ${life.afterwards}. Talks: ${life.how_they_talk}. Afraid of ${life.afraid_of}. The thing never told is about ${life.never_told_is_about}.`;
}

export const LIFE_POOLS = { HOUSEHOLD, AIR_IN_THE_HOUSE, TURNING_POINT, IN_A_DISAGREEMENT, AFTERWARDS, HOW_THEY_TALK, AFRAID_OF, NEVER_TOLD, FROM, OPEN_WITH, NOTE_TAKER, MET, GOOD_THING, REMEMBERED_DIFFERENTLY };
