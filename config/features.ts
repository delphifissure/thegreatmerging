/**
 * Feature gates for the clinician and research layer (section 11a). Nothing here is visible
 * to the partners. Risk indicators stay disabled until a validation study exists.
 */
export const FEATURES = {
  /** Sentiment flagger: enable only after `pnpm evals --suite sentiment` passes against the hand-coded set. */
  sentiment_flagger: process.env.SENTIMENT_FLAGGER_ENABLED === "1",
  /** Risk indicators: disabled until a validation cohort, effect sizes and confidence intervals exist. */
  risk_indicators: false as const,
  /** Outcome tracking retakes at 12 and 24 months, with consent. */
  outcome_tracking: process.env.OUTCOME_TRACKING_ENABLED === "1",
  /** Intervention prototype: the biographer, the personal documents and the one-notch-ahead self (docs/concept_intervention.md). */
  biographer: process.env.BIOGRAPHER_ENABLED === "1",
} as const;

export const SCREENER_HANDOFF_SENTENCE = "screener result; clinical evaluation required.";
export const DECISION_SUPPORT_LABEL = "decision support; the clinician integrates this and decides what to say.";
