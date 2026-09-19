/**
 * Names and "surprise me" seeds for the sandbox are drawn here, in code, and handed to the persona
 * writer. Left to itself a language model reaches for the same few names every time (Renata turned
 * up twice in the first handful of runs), and for the same few lives: a nurse, a teacher, a flat
 * that is too small. A draw from a list does not have favourites.
 */
export const NAME_POOL = [
  "Aoife", "Tariq", "Mei", "Seun", "Ingrid", "Mateo", "Priya", "Callum", "Yusuf", "Hana", "Dmitri", "Lucía", "Kwame", "Freya", "Arjun", "Noor",
  "Tomasz", "Imani", "Rafael", "Sinéad", "Jun", "Leila", "Anders", "Chidi", "Marisol", "Owen", "Zainab", "Pavel", "Naoko", "Elias", "Carmen", "Idris",
  "Greta", "Samir", "Beatriz", "Niall", "Thandi", "Viktor", "Amara", "Hugo", "Esther", "Kenji", "Paloma", "Rhys", "Farah", "Mikael", "Adaeze", "Luca",
  "Shirin", "Desmond", "Katya", "Emeka", "Signe", "Andrés", "Wanjiru", "Tobias", "Cormac", "Mina", "Stefan", "Yara", "Gareth", "Jide", "Annika", "Rohan",
  "Celeste", "Malik", "Ewa", "Joaquín", "Nia", "Henrik", "Salma", "Declan", "Ayumi", "Bruno", "Tamsin", "Karim", "Ilse", "Helen", "Paul", "Ruth",
  "Martin", "Joanne", "Steve", "Claire", "Ian", "Denise", "Graham", "Wendy", "Keith", "Lorraine", "Colin", "Bridget", "Winston", "Moira", "Femi", "Agnes",
  "Lars", "Rosa", "Hamid", "Petra", "Oisín", "Lindiwe", "Emil", "Soraya", "Gethin", "Ximena", "Kofi", "Marta", "Jasper", "Nadia", "Tevita", "Alma",
] as const;

const TOGETHER = ["eighteen months, living together for four of them", "three years", "six years", "eleven years", "nineteen years", "twenty-six years"];
const STAGE = ["no children", "a two-year-old", "two teenagers", "grown children who have left home", "one of them has a child from before", "trying for a baby"];
const JOBS = [
  "drives a bus", "is a dentist", "is between jobs", "is a chef who works nights", "teaches at a primary school", "runs a small building firm", "is a hospital porter", "tests software from home",
  "is a florist", "is a solicitor", "is a care worker", "is a postgraduate student", "drives a lorry and is away four nights a week", "retired early", "is a hairdresser", "is an accountant",
  "works in a warehouse", "is a vet", "is a session musician", "manages a supermarket",
];
const PLACE = ["a small flat in a big city", "a house they can barely afford", "the village where one of them grew up", "an annexe at one of their parents' houses", "a rented place they keep meaning to leave", "a new town neither of them knows"];
// Where they live. Without this nearly every couple turned out to live in England, because the lists above are written in British English.
const REGION = [
  "the north of England", "Scotland", "Ireland", "Wales", "London and its edges", "Ontario", "Texas", "Ohio", "California", "the American South", "New England", "the Pacific Northwest",
  "Queensland", "Victoria, in Australia", "New Zealand", "the Western Cape", "Kenya", "Nigeria", "Ghana", "Jamaica", "the Netherlands", "Germany", "Sweden", "Poland",
  "Spain", "Portugal", "Italy", "France", "Greece", "Turkey", "Lebanon", "Kerala", "the Philippines", "Malaysia", "Japan", "Mexico", "Colombia", "Brazil", "Argentina",
];
const RECURRING = [
  "money, and who decides how it is spent", "how much time one of them gives to their own family", "who does what in the house", "one of them wanting to move away", "sex, and who asks",
  "how they talk to each other in front of other people", "one of them drinking more than the other likes", "whether to have another child", "a friendship one of them does not trust", "work coming home every night",
  "one of them being late for everything", "how to bring up the children", "a loan to a relative that has not been paid back", "one of them going quiet for days",
];

/** Any function returning an integer in [0, max). The server passes crypto.randomInt; tests pass something predictable. */
export type Draw = (max: number) => number;
const pick = <T>(list: readonly T[], draw: Draw): T => list[draw(list.length)];

// How each name is mostly used, so that a seed saying "she is a nurse, he works from home" does not get two women's names
// and lose its "he". Names in neither list can go either way.
const MOSTLY_HERS = new Set([
  "Aoife", "Mei", "Ingrid", "Priya", "Hana", "Lucía", "Freya", "Imani", "Sinéad", "Leila", "Marisol", "Zainab", "Naoko", "Carmen", "Greta", "Beatriz", "Thandi", "Amara", "Esther", "Paloma",
  "Farah", "Adaeze", "Shirin", "Katya", "Signe", "Wanjiru", "Mina", "Yara", "Annika", "Celeste", "Ewa", "Nia", "Salma", "Ayumi", "Tamsin", "Ilse", "Helen", "Ruth", "Joanne", "Claire",
  "Denise", "Wendy", "Lorraine", "Bridget", "Moira", "Agnes", "Rosa", "Petra", "Lindiwe", "Soraya", "Ximena", "Marta", "Nadia", "Alma",
]);
const MOSTLY_HIS = new Set([
  "Tariq", "Seun", "Mateo", "Callum", "Yusuf", "Dmitri", "Kwame", "Arjun", "Tomasz", "Rafael", "Anders", "Chidi", "Owen", "Pavel", "Elias", "Idris", "Samir", "Niall", "Viktor", "Hugo",
  "Kenji", "Rhys", "Mikael", "Luca", "Desmond", "Emeka", "Andrés", "Tobias", "Cormac", "Stefan", "Gareth", "Jide", "Rohan", "Malik", "Joaquín", "Henrik", "Declan", "Bruno", "Karim", "Paul",
  "Martin", "Steve", "Ian", "Graham", "Keith", "Colin", "Winston", "Femi", "Lars", "Hamid", "Oisín", "Emil", "Gethin", "Kofi", "Jasper", "Tevita",
]);
export const NAME_USE = { MOSTLY_HERS, MOSTLY_HIS };

type Fit = "hers" | "his" | null;
/**
 * What the seed says about who is "she" and who is "he", in the order it mentions them. Only the
 * plain cases: both appear (one of each, in that order), or one appears with a partner of the same
 * kind ("her wife", "his husband"). Anything else is left open, and any pairing is fine.
 */
export function fitsFromSeed(seed: string): [Fit, Fit] {
  const she = seed.search(/\b(she|she['\u2019]s|wife|girlfriend)\b/i);
  const he = seed.search(/\b(he|he['\u2019]s|husband|boyfriend)\b/i);
  if (she >= 0 && he >= 0) return she < he ? ["hers", "his"] : ["his", "hers"];
  if (she >= 0) return ["hers", /\bher (wife|girlfriend)\b/i.test(seed) ? "hers" : null];
  if (he >= 0) return ["his", /\bhis (husband|boyfriend)\b/i.test(seed) ? "his" : null];
  return [null, null];
}
const fitsName = (name: string, fit: Fit) => fit === null || (fit === "hers" ? !MOSTLY_HIS.has(name) : !MOSTLY_HERS.has(name));

/**
 * Two different names. A name the person typed is kept; a name already used in one of their earlier
 * sandboxes is avoided while the pool lasts, so the same people do not keep turning up. Where the
 * seed says "she" or "he", the names drawn fit, in the order the seed mentions them.
 */
export function pickNames(input: { typed: [string | undefined, string | undefined]; used: string[]; draw: Draw; seed?: string }): [string, string] {
  const typed = input.typed.map((n) => n?.trim() || null);
  const fits = fitsFromSeed(input.seed ?? "");
  const taken = new Set([...input.used, ...typed.filter((n): n is string => !!n)].map((n) => n.toLowerCase()));
  let pool = NAME_POOL.filter((n) => !taken.has(n.toLowerCase()));
  const enough = (list: readonly string[]) => list.length >= 2 && fits.every((fit) => list.some((n) => fitsName(n, fit)));
  if (!enough(pool)) pool = NAME_POOL.filter((n) => !typed.some((t) => t?.toLowerCase() === n.toLowerCase()));
  const out: string[] = [];
  typed.forEach((t, i) => {
    if (t) return void out.push(t);
    const name = pick(pool.filter((n) => fitsName(n, fits[i])), input.draw);
    pool = pool.filter((n) => n !== name);
    out.push(name);
  });
  return [out[0], out[1]];
}

/** A few drawn facts to build two people around, for when the person asks to be surprised. Shown to them, so they can see where the couple came from. */
export function surpriseSeed(draw: Draw): string {
  const first = pick(JOBS, draw);
  const second = pick(JOBS.filter((j) => j !== first), draw);
  return `Together ${pick(TOGETHER, draw)}, ${pick(STAGE, draw)}. One of them ${first}, the other ${second}. They live in ${pick(PLACE, draw)}, in ${pick(REGION, draw)}. What keeps coming back between them is ${pick(RECURRING, draw)}.`;
}
