# Concept note: the intervention premise

Status: proposal, 18 September 2026. Nothing changes in the app until the owner accepts it. If accepted, it amends the build prompt's principles as listed near the end. The rehearsal engine is worked out in `concept_simulation.md`.

## Premise

The app stops trying to assess a couple and starts helping one. It is for two people who are fully committed, are not looking for a way out, and are willing to grow both as individuals and for the partnership, treated as a third thing they both look after. The work is to help each person see themselves clearly, see the other clearly, and find what their disagreements have in common: shared ends behind different means, and fears that turn out to be the same fear.

## Three documents, owned by the people

- **History**, one each, private. The story of a life as it bears on the partnership: family, earlier relationships, how money, sex, conflict and parenting were modelled, what happened and what it taught.
- **Constitution**, one each. What I value, ranked. How I actually spend time, money and attention. Where those two differ. My requirements and preferences. How I fight and repair. What I fear. What I am working on. The app drafts and the person ratifies; nothing enters without their signature, and it is amended over time.
- **Charter**, one, shared. What we both want. Where we differ and what sits underneath. Our loops. Agreements and experiments, with dates. How we disagree well. What each of us is growing toward alone, which the other supports. This is today's brief and plan, merged and kept alive.

## Five roles for the model

- **Biographer.** Long, unhurried solo interviews whose only aim is to understand. Thoughtful follow-ups, reflection, and the motivational-interviewing move of placing a stated value next to a described behaviour and asking how they fit. Drafts the history and the constitution.
- **Avatar.** A person's ratified constitution and history, assembled as a system prompt: "You are Ana, a person who…". Among other avatars it behaves as that person would. With any human it is always labelled as an avatar that can be wrong and may be a deliberate variation. It never speaks for the person.
- **Discriminator.** Checks that an avatar scores and responds like the person before it is used, topic by topic.
- **Aligner.** Runs rehearsals between the two avatars, and later the real sessions. It works the way a good couples therapist does: warm, empathic, on each person's side in turn and on the side of the partnership, free to reassure about feelings and to nudge with "have you thought of…" and with revealing questions. Its goal is disclosed, its method is quiet, and it answers honestly when asked why. Never a verdict, never a side, never a prediction.
- **Reporter.** Reads rehearsal transcripts and writes each person a private debrief: where it stuck, what moved it, and questions for you.

## The loop

Interview, draft, ratify, calibrate the avatar, rehearse one topic several times under different conditions, read a private debrief, amend the constitution, rehearse again. Then a real conversation, live or asynchronous, with an agenda the rehearsals produced. Agreements go into the charter, and the charter is revisited.

Two things make this more than a gimmick. People correct a draft far more easily than they write from scratch, so "I wouldn't say that" is the best elicitation tool available, and every correction marks a gap between the documented self and the felt self. And watching yourself from outside lowers reactivity. There is evidence the base idea works for attitudes: agents built from two-hour interviews answered survey questions 85% as accurately as the people themselves did two weeks later ([Park and colleagues, 2024](https://arxiv.org/abs/2411.10109)). Nothing comparable exists for how two people behave in conflict. Rehearsals are therefore hypotheses about where a conversation might go, never forecasts.

## Hard rules

1. **An avatar never speaks for you.** With people it is always labelled: an avatar, possibly wrong, possibly a deliberate variation. Whether your partner sees your avatar's lines verbatim is your choice.
2. **Disclosure tiers.** Every entry in a history or constitution is one of: private; usable by my avatar but never sayable; shareable. The Aligner and an output filter enforce this, with leak evals that test inferability as well as quotation.
3. **Sparring with a partner's avatar is allowed, on conditions.** Both agree to it, the avatar is labelled with its confidence, private entries stay private, and coaching is limited to approaches you would be comfortable with your partner knowing you practised. Either person can delete their avatar at any time.
4. **Calibrate before rehearsing.** The discriminator checks scores, held-out answers and the person's own "sounds like me" ratings. Poor agreement means more interviewing, not a rehearsal.
5. **Resist easy harmony.** Model agents agree too readily. Avatars hold their requirements, every topic gets a bad-day run, and success is never scored as agreement. "We differ, and we have parked it" remains a good outcome. Variations of a person touch only what that person marked open to explore, and nobody is shown a better version of their partner.
6. **Commitment is the couple's premise, not the app's verdict.** Both affirm it at the start. The app still never says stay or leave. Each person has a private safety check and can privately suspend the premise, which pauses joint work without saying why.
7. **Not therapy.** Crisis resources and the clinician hand-off stay.

## What happens to the questionnaires

A small validated core stays, as vital signs and as the avatar's calibration test: satisfaction, communication patterns, and the two screeners. It is taken at the start and at each revisit, which is also how we learn whether any of this helps. Everything else becomes optional depth.

## Amendments to the seven principles

Scoring stays code. Consent stays server-side and logged, extended with disclosure tiers and rehearsal consent. The model stays versioned, and each avatar is a versioned artifact of constitution vN and history vN. Nothing attributed to you is compared or shown until you sign it, which replaces "nothing compared until both are done". Three principles change outright: free text becomes the main event rather than the exception; "no characterization of a person" becomes "only the person characterizes themselves, and the app offers observations as questions"; and "surfaces and asks" widens to allow empathy and nudges.

## First prototype

One topic, money or household, with the two owners as the couple. Three biographer sessions each, one calibration, one rehearsal cycle, one real conversation. Measures: how often you correct your avatar, whether the real conversation reached an agreement, satisfaction before and after, and whether each of you felt understood.

## Open questions

- Does a person ever read their partner's signed avatar lines, or only a debrief of the rehearsal?
- Voice or text for the biographer interviews? The cited study used voice.
- How much history is enough before rehearsals are worth running?
