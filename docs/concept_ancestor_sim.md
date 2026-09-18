# Design note: the ancestor simulation

Companion to `concept_intervention.md` and `concept_simulation.md`. Status: speculative, 18 September 2026. The owner's idea: send your avatars into self-contained simulations to live sped-up lives, then align your real behaviour with the avatars whose lives went well. In the owner's words this is "too much", and also the coolest version. This note finds what is real in it and says where it breaks.

## What the idea is, stated precisely

It is policy search by simulated rollout, with a human carrying out the policy. Many copies of you live many possible futures. The futures that go well are examined for what your avatar did differently, and you try that. Strictly it is a descendant simulation rather than an ancestor one: your possible futures reporting back to you.

## Why it deserves to be taken seriously

- **A partnership is a long-horizon system with delayed feedback.** Small habits compound over years: bids turned away, money left undiscussed, repairs that don't land. People get almost no usable signal, because consequences arrive late and tangled with everything else. Compressing time makes consequences visible. Flight simulators, war games and Monte Carlo retirement plans all work this way. Nobody believes a retirement simulation predicts their future. It shows the spread of outcomes under different habits and which levers matter. That is the honest frame for this too.
- **Vivid possible selves change present behaviour.** People shown age-progressed images of themselves saved more for retirement (Hershfield and colleagues, 2011). In a pre-registered trial with 188 people, half an hour of conversation with an AI-generated future self lowered anxiety and strengthened the sense of connection with that future self ([MIT Media Lab, Future You](https://www.media.mit.edu/projects/future-you/overview/)).
- **Couples research already says the long run is made of small repeated moves.** A simulation that compounds them would make that finding personal.

## Where it breaks

1. **Error compounds.** A single rehearsed conversation is already only a hypothesis. Over simulated years, persona drift, a wrong world model and rough state updates multiply. After a few simulated months the avatars are fictional characters loosely inspired by you.
2. **The model's priors take over.** Over long horizons the outcome is driven less by your dynamics than by what the model believes about relationships: talk more, avoid less, redemption arcs. You would get back well-known advice with your names on it.
3. **There is no ground truth in useful time.** A rehearsed conversation can be checked against the real one within weeks. A five-year simulation cannot be checked for five years.
4. **Optimizing a life against a proxy.** "Went well" is scored by a model. Aligning real behaviour to that score risks performing for the metric, and conforming to one culture's idea of a good marriage. The couple's own charter has to define what good means.
5. **Prophecy.** Showing committed people a world where they separate plants the doubt they came in without. Simulations therefore run under the couple's commitment as an axiom. Separation is not an outcome, and no probability of it is ever computed.
6. **Fiction about your partner.** Years of simulated life generate a great deal of invented partner behaviour. Reports must be about your own avatar's choices and the state of the partnership. Stress comes from outside events, never from invented betrayals.
7. **Rumination.** What-if checking can become a habit of its own. Cycles should be tied to the revisit rhythm, not available on demand.

## The version that could actually work

**A ladder of horizons, where each rung earns the next.**

| Horizon | What it answers | How it is checked |
|---|---|---|
| A moment | Which move recovers this rupture? | Recognition, and a backtest of a remembered fight |
| A conversation | Where are the cliffs and bridges on this topic? | The real conversation, weeks later |
| Four weeks | What does this habit do to how we both feel? | Real vital-sign questionnaires at four weeks |
| A season | Does the effect hold through ordinary shocks? | A backtest of the couple's own last six months |
| Years | Nothing checkable | Parable only, and perhaps never built |

**Let the model write scenes and let a small equation run the years.** There is precedent. Gottman and Murray modelled marital interaction as coupled difference equations: each partner has a set point, an inertia, and an influence function describing how the other's last move shifts their next one, with later terms for repair (The Mathematics of Marriage, 2002). Those parameters can be estimated for one couple from rehearsal transcripts. A habit is then a parameter shift, such as repair landing more often. Thousands of worlds, with outside shocks, run in milliseconds, and every assumption is written down where it can be argued with. The language model returns at the end, to turn sampled trajectories into letters from possible futures, because stories are what move people and the numbers keep the stories honest. This sidesteps the second failure above: the long run is carried by explicit parameters, not by narrative priors.

**Compare a handful of habits. Do not evolve a person.** An evolutionary search over selves optimizes a fiction and converges on the evaluator's taste. Once variations must be near you, wanted by you, and faithful to what you have marked settled, the space is small. Take three or four candidate habits, mostly chosen by the person, and run each through the same set of worlds. Report only what wins robustly across worlds.

**Close the loop in reality.** A simulation's only product is a candidate experiment for the charter: one habit, four real weeks, vital signs before and after, then recalibrate. That is how "improve real outcomes" stays a measured claim.

## Which selves you may meet

What matters is whose objective defines the variation.

**Your own.** The owner's "healthier, more mature avatar of yourself" is the strongest near-term piece of all this. It involves one person, it has evidence behind it, and it is cheap. Three forms, from least to most fictional:

- the **wise-day self**: you, rested and at your best, which is a state variation and barely fiction at all;
- the **consistent self**: your constitution with the gaps between stated and lived values closed in the direction you chose;
- the **future self**: you, some years on, having done the work you named.

It should be a coping model, not a mastery model. The modelling literature finds that a model who struggles and recovers helps people who doubt themselves more than a flawless one does. One notch ahead of you, still recognizably you by the discriminator's measure. Uses: a mentor to ask about Tuesday's fight, a model to watch handling your hardest moment in rehearsal, and a kinder narrator of your own history.

**Your partner's.** The owner's correction is right: "better" is the wrong word, and "more internally consistent" points at something good. Nobody is ever shown a partner optimized for themselves. With their consent, you may meet the version of your partner that they are working toward, authored by them. Its best use is to rehearse being a good receiver of their growth. Early attempts at change are clumsy, and partners often miss them or distrust them, which is how change dies. The risks are comparison ("why can't you be like your avatar") and maturity rendered as therapy-speak, so the aspiration stays in the partner's own voice and is shared only by them.

## Tests that would embarrass the idea early

- **Personalization test.** Run the same simulation with a different couple's avatars. If the recommended habits come out the same, the engine is reciting priors and the personalization is cosmetic.
- **Backtest the last six months** from both history documents, and compare the simulated trajectory with what the vital signs actually did.
- **Four-week forward check.** Simulate the next four weeks under current habits and compare with reality.
- **Recognition.** An insight counts only if the person it concerns recognizes it.

## Cost

Model-written scenes on a small model cost about five cents each. A four-week comparison of three habits across ten worlds is a few hundred scenes, so roughly fifteen dollars. Once the small dynamical model carries the time, long horizons are effectively free and the model is paid only for the letters.

## What to build first, if any of it

1. The one-notch-ahead self, as a conversation partner and as a model in rehearsals.
2. The four-week habit simulation, tied to a real experiment in the charter.
3. Parameter estimation from rehearsals, and the small dynamical model.
4. Years: parable mode, and only if the first three have earned it.
