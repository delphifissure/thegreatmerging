/**
 * Concreteness heuristic (section 6, model call point 1).
 *
 * An answer passes if it is at least a configurable length and contains at least one marker
 * of a specific situation: a time reference, a named person or role, a past-tense narrative
 * verb, or the words "when", "last", "once", "for example". Only if the heuristic is unsure
 * (between the pass and fail thresholds) does the caller ask the concreteness model.
 */
export type ConcretenessVerdict = "pass" | "fail" | "unsure";

export type ConcretenessConfig = {
  /** Below this many characters the answer fails outright. */
  fail_below_chars: number;
  /** At or above this many characters, with a marker, the answer passes outright. */
  pass_at_or_above_chars: number;
  /** Number of distinct marker hits that lets a mid-length answer pass without the model. */
  pass_marker_hits: number;
};

export const DEFAULT_CONCRETENESS_CONFIG: ConcretenessConfig = {
  fail_below_chars: 25,
  pass_at_or_above_chars: 140,
  pass_marker_hits: 2,
};

const TIME_REFERENCE =
  /\b(yesterday|today|tonight|this (morning|afternoon|evening|week|weekend|month)|last (night|week|month|year|time|tuesday|monday|wednesday|thursday|friday|saturday|sunday)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at (\d{1,2}(:\d{2})?\s?(am|pm)|noon|midnight|bedtime|dinner|breakfast|lunch)|(\d{1,2})\s?(am|pm)\b|(two|three|four|five|a few|couple of|several) (days|weeks|months|years|nights|hours|minutes) ago|in (january|february|march|april|may|june|july|august|september|october|november|december)|after (school|work|dinner)|before (bed|school|work))\b/i;

const NAMED_PERSON_OR_ROLE =
  /\b(my (partner|wife|husband|spouse|son|daughter|kid|kids|child|children|mom|mother|dad|father|sister|brother|boss|friend|therapist|doctor|neighbor|mother-in-law|father-in-law|in-laws)|our (son|daughter|kid|kids|child|children|neighbor|babysitter|nanny)|the (kids|baby|toddler|teacher|doctor|babysitter|nanny|sitter))\b|\b[A-Z][a-z]{2,}\b(?=\s(said|told|asked|came|went|did|was|got|took|left|called|texted|walked|cried|laughed|yelled|sat|stood))/;

const PAST_TENSE_NARRATIVE =
  /\b(said|told|asked|came|went|did|was|were|got|took|left|called|texted|walked|cried|laughed|yelled|shouted|sat|stood|grabbed|slammed|hugged|kissed|cooked|cleaned|picked up|dropped off|drove|waited|forgot|remembered|apologized|argued|fought|stormed|sighed|looked|turned|stopped|started|ended up|happened|noticed|realized|decided|tried|found|made|gave|put|brought|showed|helped|paid|bought)\b/i;

const EXPLICIT_MARKERS = /\b(when|last|once|for example|for instance|like the time|one time|the other day|recently|specifically)\b/i;

export type MarkerHits = {
  time: boolean;
  person: boolean;
  past_tense: boolean;
  explicit: boolean;
  count: number;
};

export function markerHits(text: string): MarkerHits {
  const time = TIME_REFERENCE.test(text);
  const person = NAMED_PERSON_OR_ROLE.test(text);
  const past_tense = PAST_TENSE_NARRATIVE.test(text);
  const explicit = EXPLICIT_MARKERS.test(text);
  return { time, person, past_tense, explicit, count: [time, person, past_tense, explicit].filter(Boolean).length };
}

export function assessConcreteness(answer: string, cfg: ConcretenessConfig = DEFAULT_CONCRETENESS_CONFIG): {
  verdict: ConcretenessVerdict;
  hits: MarkerHits;
  length: number;
} {
  const text = answer.trim();
  const length = text.length;
  const hits = markerHits(text);
  if (length < cfg.fail_below_chars) return { verdict: "fail", hits, length };
  if (hits.count === 0 && length < cfg.pass_at_or_above_chars) return { verdict: "fail", hits, length };
  if (hits.count >= cfg.pass_marker_hits) return { verdict: "pass", hits, length };
  if (hits.count >= 1 && length >= cfg.pass_at_or_above_chars) return { verdict: "pass", hits, length };
  return { verdict: "unsure", hits, length };
}
