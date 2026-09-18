# Design note: how an avatar should sound

Companion to `concept_intervention.md` and `concept_simulation.md`. Status: proposal, 18 September 2026. The owner's question: can an avatar adopt the writing patterns of its human, is there anything to do ahead of time besides talking with the person a lot, and is the gap between how someone speaks and how they write a bug or a feature?

## Two kinds of fidelity

An avatar can be faithful in what it would decide and in how it would say it. The documents carry the first. The interview-built agents in Park and colleagues (2024) reproduced people's survey answers 85% as accurately as the people reproduced their own answers two weeks later, from interview transcripts placed in the model's context and with nothing done to capture voice. So voice is not needed to predict what someone would choose.

Voice matters in two other places. You have to recognize the one-notch-ahead self as you, or it has no pull on you. And a rehearsal is only as good as its delivery, because how a thing is said does much of the work in how it lands: in Carrère and Gottman (1999), the feeling expressed in the first three minutes of a conflict discussion, among 124 newlywed couples, was enough to predict divorce over the following six years.

## A person has registers, not a voice

The same person sounds different when speaking calmly, speaking while flooded, texting on a good day, texting in a fight, and writing with time to think. Register follows state and medium. That is already an axis in the rehearsal design (`concept_simulation.md`, "State"), so voice should be stored per register and chosen by the state of the run, not averaged into one.

The biographer collects the most conscientious register there is: typed, unhurried, reflective, alone. Whether that is a bug or a feature depends on the role.

- **Your documents: feature.** A constitution you sign should be in your considered voice.
- **The one-notch-ahead self: feature.** It is you rested and at your best. Your considered register is the nearest thing you have to that. It should keep your words and rhythm, and it should not learn your worst texts as "how you talk".
- **The avatar of record in rehearsals: bug.** If both avatars negotiate in their owners' most careful register, every rehearsal will be more civil than the kitchen at eleven at night, and the map will be too kind. This one needs the heated register as well, used when the run's state calls for it. The backtest in `concept_simulation.md` is what would catch the error: rehearsals that keep predicting calmer conversations than the ones that happen.

## Getting voice without a long acquaintance

No fine-tuning. A few thousand words of someone's real writing in the model's context is enough for it to pick up sentence length, punctuation, hedges, humour and pet phrases. A fine-tuned model would be a copy of a person that cannot be deleted line by line, which breaks the rule that everything here can be withdrawn. Context can.

Sources, in the order I would add them:

1. **What is already stored.** Every biographer answer is kept word for word, encrypted. Today the one-notch-ahead self sees only ratified lines. Giving it a sample of the person's own answers as style exemplars, never as facts, costs nothing new.
2. **Corrections.** Each avatar reply already gets "sounds like me" or "not like me". Add "what would you have said?" The pair (what it said, what you would say) is the best style data there is, because the content is held constant.
3. **Imported samples, labelled by register.** Let the person paste or upload things they wrote before they ever met the app: messages to their partner on an ordinary day, messages from an argument, something long-form, a voice memo transcribed. Twenty to fifty messages per register is plenty. Only their own side is kept; the partner's words are the partner's, and are dropped at import. The person picks which samples represent them, since an argument is a sample of someone at their worst.
4. **A voice section in the constitution.** Code computes what can be counted (sentence length, questions, emoji, capitals, favourite phrases), the drafter proposes lines from it, and the person ratifies them like any other line: "I go to one-word answers when I'm angry", "I joke when I'm uncomfortable", "I say 'fine' when I'm not". Behaviours, never traits. This keeps the rule that only the person characterizes themselves, and it is the part they can read and correct.
5. **Voice interviews.** The study above interviewed by voice. Spoken transcripts are the only source for the spoken register, which is the one most real hard conversations happen in.

## Text misfires, and what to do about it

Two findings point the same way. People believe their tone comes through in text far better than it does, and readers are just as overconfident that they have read it right; the writer hears their own intonation and the reader cannot (Kruger, Epley, Parker and Ng, 2005). And in Gottman and colleagues' talk-table studies (1976), distressed and non-distressed couples did not differ in what they intended their messages to convey; they differed in how the messages landed. A partner's standing feeling about the relationship colours what they hear, whatever was said (Hawkins, Carrère and Gottman, 2002). Text also loosens restraint (Suler, 2004).

Avatar rehearsals are text, so they inherit this, with a twist: a language model reads tone more literally and more charitably than a flooded person does. Left alone, rehearsals will under-produce exactly the misreadings that sink real conversations. So:

- **Make the talk table a data structure.** Each avatar turn carries a private `intent` (what I meant, and how warmly). The receiving avatar records `impact` (how it landed for me, given my history and the state I am in). Neither is shown to the other avatar. The post-game then reports the gaps: "in 14 of 100 runs, 'fine.' was meant as agreement and landed as withdrawal". This is the most useful thing a rehearsal can return, and no real conversation can produce it.
- **Give the listener a filter.** The biographer should collect how a person hears, not only how they speak: "tell me about a time you were sure what she meant, and turned out to be wrong". Ratified lines such as "when he goes quiet I assume he's angry with me" let the receiving avatar misread the way its owner would.
- **Keep the heated register out of sight and under consent.** Lines about how you sound at your worst are yours, default to the private tier, feed only your own avatar, and are never quoted to your partner.
- **Send the real conversation off the screen.** The app's output is an agenda and an opening line, and the advice to say it out loud. It should never carry a live hard conversation between the two humans by text.

## Risks

- The more an avatar sounds like you, the easier it is to forget that it is not you. The label on every avatar message matters more as voice improves, not less.
- A good voice makes wrong content persuasive. "Sounds like me" currently mixes the two. Split it: "sounds like me" for voice, "I'd say that" for content.
- Imported history is a biased sample and contains someone else's words. Strip the other side, label by register, and let the owner choose.

## What I would build next

Small and in this order: style exemplars from the person's own answers for the one-notch-ahead self; the split rating with a correction box; a paste-in sampler with register labels. The intent and impact fields wait for the rehearsal engine.

## References

Checked against their sources on 18 September 2026.

- Park, J. S., and colleagues (2024). *Generative Agent Simulations of 1,000 People.* arXiv:2411.10109. https://arxiv.org/abs/2411.10109
- Carrère, S., & Gottman, J. M. (1999). Predicting divorce among newlyweds from the first three minutes of a marital conflict discussion. *Family Process, 38*(3), 293–301. https://doi.org/10.1111/j.1545-5300.1999.00293.x
- Kruger, J., Epley, N., Parker, J., & Ng, Z.-W. (2005). Egocentrism over e-mail: Can we communicate as well as we think? *Journal of Personality and Social Psychology, 89*(6), 925–936. https://pubmed.ncbi.nlm.nih.gov/16393025/
- Gottman, J., Notarius, C., Markman, H., Bank, S., Yoppi, B., & Rubin, M. E. (1976). Behavior exchange theory and marital decision making. *Journal of Personality and Social Psychology, 34*(1), 14–23.
- Hawkins, M. W., Carrère, S., & Gottman, J. M. (2002). Marital sentiment override: Does it influence couples' perceptions? *Journal of Marriage and Family, 64*(1), 193–201. https://doi.org/10.1111/j.1741-3737.2002.00193.x
- Suler, J. (2004). The online disinhibition effect. *CyberPsychology & Behavior, 7*(3), 321–326. https://doi.org/10.1089/1094931041291295
