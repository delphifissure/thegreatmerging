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
const RECURRING = [
  "money, and who decides how it is spent", "how much time one of them gives to their own family", "who does what in the house", "one of them wanting to move away", "sex, and who asks",
  "how they talk to each other in front of other people", "one of them drinking more than the other likes", "whether to have another child", "a friendship one of them does not trust", "work coming home every night",
  "one of them being late for everything", "how to bring up the children", "a loan to a relative that has not been paid back", "one of them going quiet for days",
];

/** Any function returning an integer in [0, max). The server passes crypto.randomInt; tests pass something predictable. */
export type Draw = (max: number) => number;
const pick = <T>(list: readonly T[], draw: Draw): T => list[draw(list.length)];

/**
 * Two different names. A name the person typed is kept; a name already used in one of their earlier
 * sandboxes is avoided while the pool lasts, so the same people do not keep turning up.
 */
export function pickNames(input: { typed: [string | undefined, string | undefined]; used: string[]; draw: Draw }): [string, string] {
  const typed = input.typed.map((n) => n?.trim() || null);
  const taken = new Set([...input.used, ...typed.filter((n): n is string => !!n)].map((n) => n.toLowerCase()));
  let pool = NAME_POOL.filter((n) => !taken.has(n.toLowerCase()));
  if (pool.length < 2) pool = NAME_POOL.filter((n) => !typed.some((t) => t?.toLowerCase() === n.toLowerCase()));
  const out: string[] = [];
  for (const t of typed) {
    if (t) {
      out.push(t);
      continue;
    }
    const name = pick(pool, input.draw);
    pool = pool.filter((n) => n !== name);
    out.push(name);
  }
  return [out[0], out[1]];
}

/** A few drawn facts to build two people around, for when the person asks to be surprised. Shown to them, so they can see where the couple came from. */
export function surpriseSeed(draw: Draw): string {
  const first = pick(JOBS, draw);
  const second = pick(JOBS.filter((j) => j !== first), draw);
  return `Together ${pick(TOGETHER, draw)}, ${pick(STAGE, draw)}. One of them ${first}, the other ${second}. They live in ${pick(PLACE, draw)}. What keeps coming back between them is ${pick(RECURRING, draw)}.`;
}
