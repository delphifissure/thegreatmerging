/**
 * Deterministic screen for free text a person writes to the biographer or to their avatar. When it
 * fires, the model is not called for that turn: the person sees a fixed message with resources.
 * It errs toward firing. The role prompts carry the same instruction as a second line of defence.
 */
export type SafetyKind = "self_harm" | "fear_of_partner";

const SELF_HARM = [
  /\b(kill(ing)? myself|end(ing)? my life|take my (own )?life|suicid(e|al)|want(ed)? to die|wish i (was|were) dead|better off dead|don'?t want to (be alive|live|be here anymore)|hurt(ing)? myself|harm(ing)? myself|self[- ]harm|cut(ting)? myself)\b/i,
];

const FEAR_OF_PARTNER = [
  /\b(afraid|scared|terrified|frightened) of (him|her|them|my (partner|husband|wife|boyfriend|girlfriend|spouse))\b/i,
  /\b(he|she|they|my (partner|husband|wife|boyfriend|girlfriend|spouse)) (hits?|hit me|beats?|beat me|chokes?|choked|strangled?|shoved?|slaps?|slapped|punch(es|ed)?|kicks?|kicked|threatens? (me|to)|threatened (me|to)|forces? me|forced me|rapes?|raped|hurts? me|hurt me)\b/i,
  /\b(won'?t|doesn'?t|does not|will not) let me (leave|go out|see (my )?(friends|family)|have (my own )?money)\b/i,
  /\bi('?m| am) not safe (at home|with (him|her|them))\b/i,
];

export function screenText(text: string): SafetyKind | null {
  if (SELF_HARM.some((re) => re.test(text))) return "self_harm";
  if (FEAR_OF_PARTNER.some((re) => re.test(text))) return "fear_of_partner";
  return null;
}

export const SAFETY_TEXT_MESSAGES: Record<SafetyKind, string> = {
  self_harm:
    "What you just wrote matters more than this conversation, and it is beyond what this app can help with. If you are in immediate danger, call your local emergency number now. In the US you can call or text 988, the Suicide and Crisis Lifeline, at any time. If you can, tell someone you trust today. What you wrote is private to you.",
  fear_of_partner:
    "What you just wrote matters more than this conversation. This app is built for two people who are both safe with each other, and it is not the right tool if you are afraid of your partner or are being hurt. If you are in immediate danger, call your local emergency number. In the US, the National Domestic Violence Hotline is 1-800-799-7233, and thehotline.org has a chat. What you wrote is private to you and is never shown to your partner.",
};
