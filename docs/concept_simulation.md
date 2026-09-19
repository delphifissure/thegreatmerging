# Design note: the rehearsal engine

Companion to `concept_intervention.md`. Status: proposal, 18 September 2026. This digs into what the owner calls the ancestor-simulation premise: run many simulated conversations between two people's avatars, learn what helps, and bring that back to the real people before the real conversation.

## The bet

A real couple gets one trajectory through a hard conversation. It is high stakes and path dependent, and a bad run leaves scar tissue. A simulation gives many cheap trajectories with none. The bet is that the shape of those trajectories depends on three things we can vary: who the people are, what state they are in, and which moves they make. If so, many runs draw a map: where the cliffs are, where the bridges are, and which small changes in a person shift the most outcomes.

The map is for the people, not for the app. An insight counts only when the person it is about recognizes it.

## What a simulation can and cannot say

- **Landscape claims, fairly robust.** "This topic goes over a cliff when it opens as criticism." These rest on general conversational dynamics and a coarse persona.
- **Person-specific claims, moderate.** "You tend to defend before you ask." These depend on avatar fidelity and are checked by the person's own recognition.
- **Dyad forecasts, weak.** "If you say X, she will do Y." The engine never makes these.

The simulation is a mirror and a sandbox, never an oracle.

## The cast, with separation of powers

- **Avatar.** Built from a ratified constitution and history. Inside avatar-to-avatar rehearsals it is not told it is an avatar, because a persona that knows it is in a simulation turns agreeable and meta. With any human it is always labelled as an avatar that can be wrong and may be a deliberate variation, a test run. It never speaks for the person.
- **Discriminator.** Judges one thing: is this avatar like the person?
- **Aligner.** Facilitates rehearsals and later the real sessions, on the side of each person in turn and of the partnership as an entity. It knows the avatars are avatars.
- **Evaluator.** Scores rehearsal outcomes. It is never the Aligner, because the agent that steers must not grade itself, and it runs on a different model from the avatars to reduce self-preference.
- **Reporter.** Turns results into private debriefs.

## Fidelity: the discriminator

Four tests, each reported per topic, because an avatar can be good on money and poor on sex.

1. **Scores.** The avatar takes the short questionnaires the person took. Compare item by item.
2. **Held-out answers.** Keep some of the person's written answers out of the avatar's prompt. The discriminator sees the real answer and the avatar's answer to the same question and tries to tell them apart.
3. **Self-recognition.** The person rates sample avatar replies: sounds like me, or doesn't. This is the gold label, and every "I wouldn't say that" becomes a biographer question.
4. **Partner recognition,** with consent. The constitution is the stated self; the partner sees the exhibited self. An avatar the person endorses and the partner does not recognize marks exactly the stated-versus-exhibited gap this product exists to explore. Handle gently, and only if both agree.

Low confidence on a topic means more interviewing, not a rehearsal. Confidence is shown wherever an avatar appears: "about 70% you on this topic".

## Two rehearsals, side by side

Each person carries a working copy of their partner, written down as their model of the other. That allows two rehearsals of the same topic:

- **The fight you expect.** Your avatar against your own model of your partner. This is the argument you have already been having in your head.
- **The one more likely to happen.** Your avatar against the avatar your partner authored.

The difference between the two is the most useful thing the engine can show a person early, because it locates the conflict in the stale copy rather than in the partner. It is shown only to the person whose model it is.

Where a topic shows the two of you holding opposite poles, the Aligner treats it as the entity's ambivalence rather than a contest, and asks which of you is carrying it for both.

## Permutations: three axes, scoped by consent

- **State.** The same person on a different day: depleted, stressed, just had a win. Always allowed, and often the most practical finding, such as "this topic only goes wrong when either of you is tired".
- **Moves.** The same person with a different opening or strategy: soft start or criticism, asking or telling, now or later. This is skill exploration, which is what a therapist coaches.
- **Disposition.** A nearby self: holds a requirement as a preference, defends a notch less, swaps two adjacent values. This is the owner's "discover more aligned values" idea, and it is the most powerful and the most loaded.

Rules for the third axis:

- **Settled and open.** Every line in a constitution is either settled, meaning "this is me, do not vary it", or open, meaning "I am willing to see what a different me would do here". Requirements are settled by default and everything else is open by default; the owner can change any mark. Variations of a person touch only open lines, so these marks are the dimensions of that person's permutation space.
- **Whose objective defines the variation.** You may meet your own variations. With your partner's consent you may meet the version of them that they are working toward, authored by them. Nobody is ever shown a partner optimized for themselves. See `concept_ancestor_sim.md`.
- **Near, wanted, and helpful.** A variation is only worth reporting if the discriminator says it is near the person, the person says it is a self they would want to be, and the evaluator says it helped.
- **Symmetric burden.** A search for harmony will find that the more accommodating partner is cheaper to change, and would quietly optimize that person away. The reporter must always show leverage on both sides and joint moves, and must never rank who should change.

## Many versions of you, right now

The owner's point, 18 September 2026: permutations are not only fuel for the engine, and not only the one-notch-ahead self or the long horizon. They are also "a bunch of versions of me, right now", and that deserves to be a thing a person can meet.

A person is a range, not a point. Over two to three weeks of daily life the typical person showed nearly every level of every trait, while their averages stayed almost perfectly stable (Fleeson, 2001). Personality shows up as stable if-then patterns across situations (Mischel and Shoda, 1995). A single fixed avatar is the person's average, and hard conversations are decided on the days that are not average. Which version of you arrives is often the most consequential variable in the conversation, and it is one the couple can choose.

Three kinds of self, by what they cost to act on:

| Self | What differs from you today | Question | Cost |
| --- | --- | --- | --- |
| Many versions of you, right now | State, moves, framing, the room you are in, open lines one at a time | Which of me could show up, and what does each do? | Often nothing: pick the time, the opening, the state |
| You, one notch ahead | A small step along what you are working on | What would I do a little further along? | Practice, over weeks |
| The two of you over years | Habits, run forward | Where do our habits take us? | One habit, four real weeks |

The one-notch-ahead self is one version from the edge of the range, chosen by its owner. The hundred-by-hundred design is two ranges meeting.

**A fifth source of versions: the room.** Beside state, moves, disposition and framing, there is the person as they already are elsewhere: at work, with friends, with their own family. Someone who asks three questions before disagreeing at work, and none at home, already owns the move they need. The nearest nearby self is one you already are in another room.

**It has to be designed in.** A model given a persona does not vary with state by itself: in a dataset of 1,667 people measured across contexts, 74% of the variance was within the person, and models answered much the same whatever the state (Harry and colleagues, 2026; a preprint on Reddit users). So each version is the ratified documents plus one small, named change: a state preamble, an instructed opening, a reframed topic, a room, or one open line altered. One change at a time, combinations by design, and the change shown to the person as a difference from their own document.

**The solo panel ("ask all of me").** Before any rehearsal with a partner's avatar, a person puts one situation to a panel of their own versions and reads the answers side by side.

1. Rate each: "me", "me on a bad day", "not me". These ratings draw the edge of the self as its owner sees it. That answers the open question below about how distance from the real person is measured: by the person first, with the discriminator learning from their ratings.
2. Read what never changes. A response every version gives is a candidate for a settled line.
3. Read what flips. If every rested version agrees and no depleted version does, the finding is about when to talk, and nobody has to change.
4. Borrow from another room.

**Noise is not a version.** The same avatar run twice gives different words. A version counts as different only when it departs from the person by more than reruns of the person depart from each other, so every version is replicated, and random sampling is never presented as another you.

**Rules.** You meet only your own versions. Each is labelled as a test run with its one change stated. A version's words are never quoted to your partner. Every version is you: the panel is for choosing conditions and practising moves, never for disowning what the tired version said.

Built on 18 September 2026 as "Ask all of me" (`/mentor/panel`, behind `BIOGRAPHER_ENABLED=1`). One situation goes to every version the person's lines can support: as you are (run twice, so the noise floor is on the page), rested, running on empty, asking first, one open fear turned down, as you are at work, and one notch ahead. Each card states its one change, leads with the first thing that version would say out loud, shows the lines it drew on, and takes the three-way rating. After three ratings the person can ask for a reading across them: what held in every version, what changed, and one question. The versions are defined in `config/versions.json`. Not built: the person choosing or writing their own versions, moves beyond asking first, framing as an axis, and any use of the ratings as a distance measure beyond the tally on the panel page.

- Fleeson, W. (2001). Toward a structure- and process-integrated view of personality: Traits as density distributions of states. *Journal of Personality and Social Psychology, 80*(6), 1011–1027. https://pubmed.ncbi.nlm.nih.gov/11414368/
- Mischel, W., & Shoda, Y. (1995). A cognitive-affective system theory of personality. *Psychological Review, 102*(2), 246–268. https://psycnet.apa.org/record/1995-25136-001
- Harry, T., Ngong, I., Nweke, C., Feng, Y., & Near, J. (2026). *Beyond fixed psychological personas: State beats trait, but language models are state-blind.* arXiv:2601.15395. https://arxiv.org/abs/2601.15395

## A sandbox for the machinery

Built on 18 September 2026 at `/sandbox`: two made-up people, written by hand or generated from a few words, each with a life history of the kind a therapist would hold in their notes, plus the history they share. Each avatar is given its own notes and the shared history, never the other's notes, and then a situation. Whoever set it up reads both sides, sees what each avatar was told, and sees each turn coded as a move with how it was meant and how it landed. It exists to look at the conversational machinery without anyone's real material in it: whether avatars hold their positions, whether a secret stays a secret, whether two runs of the same scene resemble each other. It says nothing about fidelity to a real person, which is what the replay is for.

## The hundred-by-hundred design

The owner's thesis: let 100 permutations of you negotiate a hard topic with 100 permutations of your partner. If few succeed, what is different about the versions that did, and, if the real people like that outcome, how would each have to adjust?

One success in ten thousand is not evidence. With that many runs and that many features, something will always look special about the winner, and the same pair rerun with a different seed may fail. The rigorous form of the thesis is to estimate the success surface, not to find the one winning universe:

- **Design the permutations.** Vary each person along a handful of open lines, states and moves, using a fractional design so 100 versions cover the space evenly. Add a fourth axis: the **framing** of the topic itself.
- **Replicate.** Run pairs more than once, and stop unpromising ones early, so cost stays in the hundreds of dollars on small models.
- **Read effects, not winners.** Which of my factors raise the success rate whichever partner-version I face? Which of theirs? Which work only in combination? The last kind are joint moves and are reported to both people.
- **Rank by leverage.** Effect on success, divided by how far the variation sits from the real person. Moves and framings are cheap to adopt; dispositions are dear. Winning worlds usually differ by path, not by who the people are.
- **If success stays rare everywhere,** the finding is about the topic. There is no zone of agreement under this framing, so split it, widen it, or park it.

**Adoption, outcome first.** Show both people the destination that the successful worlds reached, without the path. If both like it, each privately sees what their successful versions did differently, ranked by leverage, and both see the joint moves. Then rehearse the path with the real person in the loop, and then do it for real. The script will not survive contact; the opening moves and the principles will.

**The change budget.** Each person's capacity to accommodate is one of the entity's finite resources. Each person sees their own leverage privately. If, across topics, the adjustments keep falling to one person, the Aligner raises that openly as a fairness question for the couple.

The broad design finds where success lives. Branching finds the moves.

## The search: branch at ruptures

A full grid of N by N permutations is wasteful and hard to read. Do what a therapist does instead.

1. Rehearse the topic with the two true avatars under a few states.
2. The evaluator marks ruptures: the turn where it went wrong.
3. Rewind to the turn before and try several alternative moves, and variations where allowed.
4. Report at the level of the moment: "Here, versions of you that asked a question recovered in 4 of 5 runs. Versions that explained recovered in 1 of 5."

This is cheaper, and the output is already in the form a person can use.

## The objective is a vector, never agreement

If the Aligner or evaluator rewards agreement or pleasantness, the engine learns capitulation and conflict avoidance. Score instead, for every rehearsal:

- each side felt understood;
- each side's settled requirements intact, as a hard constraint;
- rupture followed by repair;
- agreement reached, or consciously parked;
- concessions roughly balanced across runs;
- no contempt, criticism, defensiveness or stonewalling markers. The existing sentiment-flagger role already detects these and can be pointed at avatar transcripts.

Long-run success is measured on the real people, with the vital-sign questionnaires at each revisit.

## Talking to your partner's avatar

The owner is right that this is useful. Rehearsing a hard conversation is an established technique, and a sparring partner that reacts like your partner is a low-risk way to get there faster. The earlier blanket ban is withdrawn. Conditions:

- Both agree to be sparred with. The avatar is always labelled, with its confidence and whether it is a variation.
- Disclosure tiers hold. Asked about anything private, the avatar says that is a question for the real person.
- **The publicity test.** Coaching is limited to approaches you would be comfortable with your partner knowing you practised. "Lead with appreciation, ask before advising" passes. "Wait until she is tired" fails. This is the line between skill and manipulation, since the same tool can optimize persuasion against a model of someone's psychology.
- What you say while sparring is yours. You get the transcript, a post-game summary of what you tried and what landed, and trends across sessions in your own behaviour: how you open, how soon it ruptures, how often you repair.
- The modelled person receives none of your words. With your approval, two things can flow back: moments where their avatar was unsure how they would respond, turned into general questions for their biographer, and a post-game you choose to share.
- The Aligner watches for substitution: practising forever, or venting at the avatar, in place of the real conversation.

## The Aligner: disclosed goal, quiet method, honest on request

The owner wants it to work subtly. Among avatars it can be as subtle as it likes. With people, covert steering is manipulation even when benevolent, and discovery would cost the trust everything else rests on. A therapist resolves this the same way we should: the goal is disclosed and consented to at the start; individual moves are not narrated as they happen; and "why did you ask me that?" always gets a true answer. The "Why this is being asked" control already exists.

The Aligner knows both private sides. It may use private material to choose its questions. It may never reveal it, and it must not make it inferable, which is harder: "have you considered she might be afraid of X" is a leak. Nudges drawn from a partner's private material must be phrased as questions a therapist would ask anyone, and leak evals must test inferability, not just quotation.

## What comes back, and when the loop stops

Each person privately receives one to three moments, their own avatar's lines, a description of how the other side reacted, the alternatives that worked, and one question for their constitution. Whether a partner's avatar lines are shown verbatim is the modelled person's choice. Ratify or amend, rebuild the avatar, run again. Stop when fidelity and outcomes are stable, or when the people feel ready. Then hold the real conversation with an agenda and each person's chosen moves to try. Afterwards, compare it with the rehearsals. With consent, the real transcript is the best data the avatars will ever get, so the engine improves for this couple over time.

## Known failure modes of model-on-model simulation

Agents agree too readily. Personas drift over long dialogues, so re-ground every turn and keep sessions short. Personas become caricatures of their stated traits. Runs collapse into sameness, so vary state and opening and measure diversity. Judges prefer fluent, therapeutic-sounding talk, so score behavioural markers and calibrate against human-rated transcripts. Shared base models share blind spots. Any single metric will be gamed.

## How to find out cheaply whether it works

1. Single-avatar fidelity, as above.
2. **Backtest a remembered fight.** Each of you separately describes a past disagreement. Rehearse it from the state before. If neither of you recognizes the shape, the engine is not ready for future ones. Built on 18 September 2026 at `/replay`:
   - One of you names an argument you both remember, where and when, who spoke first and roughly what they said. That frame is the one thing written for the other to read. The other says yes or no, and consent is logged.
   - Each writes a private account: the state they were in, what they did and what their partner did (ticked from a fixed list of moves), and how it ended. Each avatar is told only its own person's state. No avatar sees what anyone remembers doing, because that is the answer being tested.
   - The avatars of record take turns from the agreed opening line, one turn per request. They are written as the person in the moment and are not told they are avatars. A different model codes each turn as one of fifteen moves.
   - Each person reads their own avatar's words and only the moves of the other's, plus how each turn was meant and how it landed, as numbers from -2 to 2. Private lines are left out of a rehearsal avatar altogether; a person has to allow lines, one by one or all at once.
   - Recognition is scored in code, ignoring order, with explaining and defending counted as one act and going quiet and leaving as one. Then each gives a one-word verdict on the shape, and sees the other's only after giving their own. Either can withdraw at any point, which deletes the turns and both avatars' words.
   - **Watching it together, and coaching.** Each person can open their own avatar's words; they cross only while both are open, and either closing theirs closes it for both. While open, each reads both avatars, sees the other's coaching, and can mark a turn of the other's avatar as how they remember it or not. Under any turn of their own avatar a person can write what they would really have done ("here I don't explain, I say 'not now' and go and eat") and run the replay again from that turn as a new take, with every note so far. Nobody coaches someone else's avatar. A retake with no note is simply another draw.
   - Not built: branching chosen by an evaluator at the rupture (the person picks the turn), the evaluator itself, and any replay of a conversation that has not happened.
3. Prospective check: rehearse, then talk for real, then compare.

Cost is small at this scale. With avatars on Claude Sonnet 5, the Aligner and evaluator on Claude Opus 5, and prompt caching, a full rehearsal is about sixty cents and a branch about fifteen. A topic cycle is roughly five to ten dollars.

## Open questions

- How reliable is the automated evaluator across ten thousand runs? It needs calibrating against the couple's own ratings of a sample of outcomes.
- How is "distance from the real person" measured for the leverage ranking: by the discriminator, by the person, or both?
- Should each person's model of the other be elicited before or after they read the other's constitution?
