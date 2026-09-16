# Research brief: adaptive, LLM-adjudicated relationship alignment instruments

## Objective

Produce a rigorous literature review and design brief on how couples' compatibility, alignment, and joint decision-making have been measured and supported, and on how those methods could be rebuilt as a branching (adaptive) questionnaire with multiple LLMs in the loop. The LLMs' roles: administer the instrument conversationally, adjudicate between the two partners' responses, advocate for each partner's stated interests, check each respondent's internal consistency, and classify disagreements into (a) fundamental incompatibilities, (b) solvable or negotiable differences, and (c) communication failures that look like disagreement but aren't.

The end product is not a summary of the field. It's a synthesis that says what's known, what's validated, what the incumbent instruments get wrong, and what a new instrument would need to look like and how it would need to be validated.

## Context

Existing standards (PREPARE/ENRICH, RELATE, FOCCUS, SYMBIS, the Gottman Relationship Checkup, and the research-grade scales behind them) are fixed-form self-report inventories, scored on agreement between partners and administered by a trained facilitator. They predate conversational AI. The working hypothesis is that much of that standard will need to be rewritten: an adaptive, conversational instrument with LLM adjudication can probe deeper, follow up in real time, detect contradictions, and separate real sticking points from miscommunication in ways a fixed form cannot. The review should test that hypothesis honestly, including the ways it could be wrong.

## Questions to answer

### 1. What's already validated, and how good is it?

- Catalogue the major couple and premarital inventories: PREPARE/ENRICH, RELATE, FOCCUS, SYMBIS, Gottman Relationship Checkup, Marital Satisfaction Inventory (MSI-R), Dyadic Adjustment Scale and RDAS, Couples Satisfaction Index (CSI), and any others with peer-reviewed validation. For each: domains covered, item count, time, administration model, cost, psychometrics (reliability, validity, predictive validity for outcomes like satisfaction, stability, and divorce), and published effect sizes.
- What do they actually predict, over what horizons, and how well? Distinguish marketing claims from published evidence.
- Known limitations: self-report bias, social desirability, ceiling effects, sentiment override, cultural specificity, the gap between stated beliefs and observed behavior.

### 2. Self-report versus behavior versus perception

- Summarize the evidence that observed behavior (e.g., Gottman's SPAFF coding, the Oral History Interview, demand-withdraw patterns) predicts outcomes better than self-report, and by how much.
- Summarize the literature on discrepancy or perception-gap measures (self-rating versus partner's rating of the same behavior) as predictors, versus simple agreement scores.
- Identify what a text-only, conversational instrument can and cannot recover of the behavioral signal, and any work on inferring interaction patterns from written responses.

### 3. Fundamental incompatibility versus solvable difference versus miscommunication

- Review the perpetual-versus-solvable problems distinction (Gottman), gridlock, and dreams-within-conflict; the acceptance-versus-change framework from Integrative Behavioral Couple Therapy (Christensen and Jacobson); the dealbreaker literature in mate selection; attachment-style pairing research (especially anxious-avoidant pairings); sexual desire discrepancy research; values-conflict versus preference-conflict distinctions.
- What criteria, if any, have empirical support for classifying a disagreement as fundamentally incompatible rather than negotiable? What predicts which perpetual problems couples can live with?
- What does the literature say about disagreements that are actually failures of communication, definitional mismatches, or perception gaps, and how they're detected?

### 4. Adaptive and branching assessment

- Review computerized adaptive testing and item response theory as applied to psychological and relational assessment; conditional-logic questionnaires; semi-structured interviews with branching (the Gottman Oral History Interview as the key precedent for conversational assessment that predicts outcomes).
- Evidence on adaptive versus fixed-form assessment: precision, respondent burden, and any validity trade-offs.
- Any published work on conversational or chatbot-administered assessment, in relationships or in adjacent clinical intake (e.g., adaptive depression screening), including validity against the fixed-form originals.

### 5. Decision-making and negotiation frameworks for couples

- Interests-versus-positions negotiation (Fisher and Ury), BATNA in the relational context, structured decision-making, relationship contracts and agreements, family meeting protocols, and structured dialogue methods (e.g., Imago dialogue, speaker-listener technique, Gottman's conflict blueprints).
- Which of these have outcome evidence, and which are practice wisdom only.
- How a couple's agreements have been documented, revisited, and measured for adherence, if at all.

### 6. LLMs and multi-agent adjudication

- Review AI-mediated communication (Hancock and colleagues), LLM-mediated consensus and deliberation (including the DeepMind "Habermas machine" work on LLM-mediated group agreement), AI mediation and conflict resolution studies, and any evaluations of AI relationship-coaching or couples-support applications.
- Review multi-agent designs relevant to adjudication: LLM-as-judge, debate and adversarial-critic setups, advocate agents, self-consistency and contradiction detection, and calibration. What's the evidence that multiple agents in advocate, critic, and judge roles produce better or fairer outputs than a single model?
- Review the failure modes that matter here: sycophancy, gender and cultural bias in relationship advice, privacy of intimate data, manipulation and dependency risks, and the specific danger of an AI declaring a relationship fundamentally incompatible. What guardrails have been proposed or tested?
- Assess the hypothesis directly: can a fixed, validated instrument be converted into an adaptive, LLM-administered form without losing validity? What would measurement invariance and re-validation require?

## Deliverables

1. An annotated bibliography, prioritizing peer-reviewed sources: classic instrument validation studies, and 2020-onward work for the AI components. Note effect sizes where they exist.
2. A comparison table of the major instruments: domains, items, time, administration, cost, validation status, what they predict.
3. A synthesis (three to five pages) of what actually predicts relationship outcomes, what the incumbent instruments miss, and what a conversational instrument could plausibly add.
4. A design brief for a branching, multi-LLM-adjudicated instrument: domain structure, branching logic, the roles and rules for each agent (administrator, advocate for each partner, consistency checker, adjudicator), explicit criteria for classifying disagreements into the three categories above, how perception gaps are elicited and scored, and what stays human (a facilitator, a therapist, the couple's own decision).
5. A validation plan: criterion outcomes, sample sizes, comparison against existing instruments, how to test measurement invariance between fixed and adaptive forms, and how to test whether the adjudication improves on what couples or facilitators do unaided.
6. An ethics and safety section: privacy, consent, data handling, bias, the limits of what the system should ever conclude, and where it must defer to humans.
7. A short list of open questions the literature can't answer yet.

## Constraints

- Prefer original research and validation studies over secondary summaries and vendor materials. Flag where claims rest on vendor data alone.
- Distinguish clearly between evidence and practice wisdom throughout.
- Cover cross-cultural findings where they exist; note where the evidence is limited to Western, married, heterosexual samples.
- Plain language. Define technical terms once. Write for a technically literate reader who isn't a psychologist.
