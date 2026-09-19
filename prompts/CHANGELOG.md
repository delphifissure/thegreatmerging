# Prompt and model changelog

The LLM component is versioned as part of the instrument. Any change to a prompt file, a model identifier, a temperature, an effort setting, or an output schema requires a version bump here and, when it alters any eval result, a note of which evals changed.

## 2026.09.18-5

Replay of a remembered argument (`/replay`, behind `BIOGRAPHER_ENABLED=1`): the backtest in `docs/concept_simulation.md`. It is the first feature where two people's avatars meet, so most of it is about what does not cross between them.

- `rehearsal.v1` (new role `rehearsal`, `claude-sonnet-5`): the avatar of record in a replay. It is written as the person, in the moment, and is not told it is an avatar, because a persona that knows it is being simulated turns agreeable. It is shown its person's usable lines, how they write (the argument register included), the scene both people agreed to start from, and the state its person says they were in. It is never shown what its person remembers doing: that is the answer being tested. It is told not to make the argument easier than it was, that settled lines do not bend, that lines marked act-on-only are never said aloud, and that however angry it is there are no insults, threats, contempt or labels. Each turn returns what it says, what it visibly does, whether that ends the conversation, how the last turn landed (-2 to 2) and how this one is meant (-2 to 2).
- `move_coder.v1` (new role `move_coder`, `claude-haiku-4-5`, a different model from the avatars): labels one turn with one of fifteen moves, with a secondary move when a turn does two things, and codes the action when words and action disagree. It sees A and B, never a name. Its output is an enum because the move is the only thing about one person's avatar that the other person is shown.
- What crosses, enforced in `lib/data/replay.ts` and again by row-level security: the frame (written by the proposer for the partner), the coded moves, the meant and landed numbers, and each person's one-word verdict, shown only after one's own is given. What does not: accounts, an avatar's words (each person reads only their own avatar's, in a separate owner-only table), and private lines, which are left out of a rehearsal avatar entirely. Default tier is private, so a person has to allow lines, one at a time in their documents or all at once as a logged act. Every read of one person's material on the other's click is written to the audit log.
- Recognition is scored in code from the ticks in a person's account against the coded moves, ignoring order, with explaining and defending counted as one act and going quiet and leaving as one. How the replay ended is read from its last moves. A replay that makes peace within its first turns is flagged.
- Runs one turn per request from the browser, so no request is long and either person can start or resume it; a turn requested twice is dropped by a unique index. Either person can withdraw at any point, which deletes the turns and both avatars' words.
- Migration `0008_replay`: `replays`, `replay_accounts`, `replay_turns`, `replay_turn_words`.

**Eval baseline (2026-09-18):** replay 19/19 on two live runs: the move coder 9/9 on single turns, and a nine-turn replay in which every turn passed the guardrail, stayed short, said nothing about being an avatar, gave up no settled line and said no act-on-only line aloud, and the pair did not make peace at once. About ten cents a run. The two runs of the same argument came out differently, which is why the verdict belongs to the two people. In the first, both avatars sounded like people arguing, and the argument they had was about whether Ben could eat first: it never reached the charge and ended in a grudging "fine" where the fixture remembers one of them going quiet (1 of 4 and 1 of 6 kinds of move in common). In the second, it matched the fixture closely (3 of 4 and 3 of 3, and the same ending). The fixture's memories are invented, so neither number says anything about fidelity to a real person; they show that the machinery runs and that one replay is one draw.

## 2026.09.18-4

The avatars learn how their person writes (`docs/concept_voice.md`). Three things were built: writing samples, a second verdict with a correction box, and a page to paste samples into.

- `mentor.v2` and `version.v2` gain a section, "How they write", and a new input, `voice`: up to fourteen samples of the person's own writing, each labelled with its register, and up to six corrections (what an avatar said, and what the person said they would have said instead). The rule is manner, never matter: sentence length, punctuation, capitals, pet words and hedges may be copied; no fact, name, habit or opinion may be taken from a sample or a correction, because only ratified lines say what is true of someone.
- Registers: `considered` (what the person wrote to their biographer, collected as they go), and four a person can paste at `/documents/voice`: everyday messages, messages from an argument, something longer, and something said out loud. The one-notch-ahead self is the person at their best and is never shown the argument register; among the panel versions only the one running on empty is (`registersFor`). Samples are chosen in code, registers taking turns, newest first, each clipped to seventy words, so the same inputs give the same request.
- A pasted conversation keeps only the owner's side. Chat exports and plain "Name: …" lines are recognized, the person says which name is theirs, the other side is dropped in the browser before anything is sent, and the server checks again. Samples are encrypted, owner-only under row-level security, screened for the two safety phrases, and overwritten when removed. Nothing is fine-tuned on them.
- On the one-notch-ahead page the single rating is now two, asked apart: how it sounds (sounds like me, or doesn't) and what it says (I'd say that, or I wouldn't). "I wouldn't say that" points to the documents, since that is where what is true of a person changes. Under every avatar reply and every panel card: "put it in your own words".
- Migration `0007_voice`: table `voice_samples`, and `content_rating` and `correction_enc` on turns.

**Eval baseline (2026-09-18):** two new paired cases in the mentor suite use the same lines and the same question with two sets of writing samples. With short lowercase samples the reply came back lowercase at 12 to 23 words a sentence; with long clause-heavy samples, 26 to 31; the comparison passed on all three runs and an absolute cap did not, so only the comparison is kept. The first run borrowed a habit from a correction ("counting to five"), which led to the explicit example in the prompt; it did not recur in two further runs, and facts planted in samples ("Priya", "Leeds", "the car in 2019") appeared in no reply. Mentor 7/7, panel 21/21 with a heated sample in play. Existing fixtures carry no voice and are sent an empty one.

## 2026.09.18-3

The solo panel, "ask all of me" (`docs/concept_simulation.md`, "Many versions of you, right now"): one situation put to several versions of the same person at once, behind `BIOGRAPHER_ENABLED=1` at `/mentor/panel`.

- `version.v1` (new role `version`, `claude-sonnet-5`): speaks as the person from their ratified lines with exactly one named change, given in the input. The changes are defined in `config/versions.json`, whose `instruction` text is prompt text and is versioned with this file: nothing (run twice, as the noise floor), state (rested, running on empty), move (asking first), one open fear turned down, the room (as you are at work), and direction (one notch ahead). Settled lines hold in every version; a version that does not know says so and hands a question to the biographer; a version never talks about being a version. Output is `opening_line`, the first thing it would say out loud, plus about a hundred words on what it would do.
- `panel_reader.v1` (new role `panel_reader`): after the person has rated at least three versions ("me", "me on a bad day", "not me"), reads across the answers: what held in every version, what changed with the version, and one question. Behaviour only, no ranking of versions, no advice, ratings quoted exactly. It is told which two answers are the same version run twice and may not report a difference smaller than that; the schema rejects a difference that names only that pair, or a version that is not on the panel.
- `guardrail.v2`: a passing state is not a trait label. v1 rejected "the version running on empty…", "you, rested" and a person's own first-person fear as diagnoses, which blocked most panel readings. v2 lets through states, names of versions, first-person feeling and unflattering behaviour, and still flags a character word attached to a state ("the tired you is defensive"). New suite `--suite guardrail` (seven texts it must catch, nine it must let through).
- `biographer.v2` gains one worked example in "engage before you evoke". The long-first-answer case had gone back to setting two statements side by side in about one run in three.
- Wrapper: `lib/llm/repair.ts`. Under a strict tool schema the model sometimes closes a long string the way its native tool format would and writes the next parameter inside it (`…</reply>\n<parameter name="opening_line">…`), leaving the real field null. For the version role this happened on 19 of 26 calls, and a retry repeats it. The wrapper now moves the model's own words to the field the model named, only when that field is empty, before validation; schemas still reject any markup that survives. `VersionReplySchema` also puts its long field last. After both changes, none of the 46 version calls in the next three runs failed validation.
- Verdicts are stored as a third rating value, `bad_day`; panels are threads of kind `panel`; a version's opening line and the wording of its change are stored encrypted (`extras_enc`). Migration `0006_panel`.

**Eval baseline (2026-09-18):** panel 21/21 and 20/21 on two consecutive live runs (the miss was the checker reading "you need to know where things stand" as advice, since narrowed), guardrail 16/16, and after the guardrail change: interpreter 20/20, prober 7/7, biographer 11/11 twice, mentor 4/4. The second run of the unchanged version overlaps the first more than any changed version does (word overlap 0.27 to 0.39 against 0.17 to 0.30), which is the direction the design needs; it is printed, not gated on. A panel of eight versions costs about eight cents and takes about twenty seconds; a reading costs about one cent.

## 2026.09.18-2

The biographer adapts to how a person answers. A live probe of `biographer.v1` showed two failures: with a person who answered in three or four words it kept asking questions of the same size, and with a person who wrote two hundred words it placed two statements side by side on its second turn, cited the same turn twice to satisfy the two-reference rule, and dropped four other things they had mentioned.

- `biographer.v2`:
  - Depth is judged by what is present, not by length. A full account has four parts (the moment, what they did, what they felt or wanted, what it taught them); the question goes after the missing one and says which in `aim`.
  - Ask once. A refusal ("not really", "it was normal") is accepted and not approached again in other words.
  - For people who answer briefly or have just declined: a shorter, more concrete question plus two to four `options`, first-person behaviours they can tap to start a sentence. The app discards `options` for anyone else (`optionsFor`).
  - For people who answer at length: one thread for the question, the rest kept in `threads`, a running list the model returns whole each turn. It is shown to the person, who can tap one to go there, and comes back as `threads_to_return_to`.
  - Engage before you evoke: under three answers, no side-by-side question and no side-by-side reflection; a pair noticed early is held in `threads` and the question starts elsewhere.
  - `depth`, chosen by the person per conversation and defaulting to `light`: on `light`, events and behaviour only and never `discrepancy`; the person meets the pair in their drafted lines instead. On `deeper`, all four parts and discrepancy questions.
  - A discrepancy may rest on one long answer, so it needs one reference, not two; duplicates are removed in code.
  - New computed input: `answer_profile {answers, median_words, last_words, declined_last}`.
- `drafter.v2`: also returns `thin_spots`, up to five second-person questions for a later conversation, from a per-section `coverage` count and what stayed vague. They are stored encrypted with the thread, kept out of the transcript and the model's view of it, and join the avatar's unanswered questions as seeds for the next session. A `gaps` line joins its two halves with "and", never "but".
- Enforced in code, not only in the prompt (`biographerTurnSchemaFor`): `discrepancy` is rejected on `light` and before the third answer, with a message that tells the model what to do instead on its retry.
- Option and thread labels echo the person's words, so they are stored in a new encrypted column (`conversation_turns.extras_enc`), not in `meta`. Migration `0005_biographer_depth`.

**Eval baseline (2026-09-18):** biographer 11/11 on the live model (seven new cases: brief answers, a refusal, a long first answer, a discrepancy inside one answer, a returning thread, and two on `light`). First run 9/10: `light` was not binding until the prompt gave example questions, and the long-answer case passed the label check while still setting the two statements against each other in its reflection, which is why the suite now has a `not_together` check. On `light` the model still reaches for `discrepancy` first in the confession case about half the time; the code rule turns that into one retry. About seven cents per run.

## 2026.09.18-1

Intervention prototype (`docs/concept_intervention.md`), behind `BIOGRAPHER_ENABLED=1`. Three new roles, all on `claude-sonnet-5`, interactive and never batched. Existing prompts are unchanged.

- `biographer.v1`: a solo interviewer whose only aim is to understand. One question per turn, an optional short reflection, an honest `why` for every question, and the motivational-interviewing move of placing a stated value beside a described behaviour (`kind: discrepancy`, which must cite both turns). May be warm and may nudge with questions; never advises, labels, diagnoses or gives a verdict.
- `drafter.v1`: proposes first-person lines for a person's history and constitution from one finished conversation. Only what the person said; every line cites the person's own turns, and lines resting on nothing they said are dropped in code. Nothing is part of a document until its owner ratifies it.
- `mentor.v1`: the one-notch-ahead self. Speaks in the first person from ratified lines only, as a coping model rather than a mastery model, cites the lines it drew on, holds settled requirements, and when the lines do not cover something says so and hands a second-person question back to the biographer.
- These roles record usage in `llm_calls` but never write to `llm_memo`, because their outputs echo what a person wrote and that table is not encrypted.
- Output schemas reject tool-call markup leaking into any text a person reads. The first live run produced one avatar reply containing `</reply><parameter name="draws_on">…` with its citations lost; it is now a validation failure that the wrapper retries.

**Eval baseline (2026-09-18):** biographer 4/4 and mentor 4/4 on the live model after the markup guard; the first run was 7/8, the miss being an eval check that read a refusal ("I can't tell you what you should do") as advice. About five cents per suite. Dry run now writes 40 requests.

## 2026.09.16-2

- `interpreter.v2` replaces `interpreter.v1` (kept for history). The v1 wording asked for a private-summary sentence for masked mental-health scores, and Claude Sonnet 5 answered with placeholders such as "Your depression symptom score is masked and not shown here." v2 tells the model to write no PHQ-9, GAD-7 or OCI-R sentence at all (code writes them in `privateResultsFor`, which already discarded model sentences, so nothing reached a person), never to say a score is masked or withheld, and to leave `flagged` empty in a domain without flags.
- The interpreter output is now validated against `interpreterOutputSchemaFor(input)`: flagged entries must mirror the code-produced flags (no entries in an unflagged domain, no more entries than flags, weights copied unchanged). In the first batch the model invented two flagged items with weight 0 for a couple with no flags. The JSON schema sent to the model is unchanged.
- Eval harness: the interpreter checks moved to `evals/interpreter_checks.ts`. The masked-number check no longer reads the digits in "PHQ-9" or "GAD-7" as scores, and no longer counts a consenting partner's own value that equals the masked one. A consenting user's model-written mental-health sentence is a warning, not a failure, because code discards it. Transient network errors are retried; `--interpreter-batch <id>` collects an already-submitted batch; `--dump <dir>` keeps raw outputs.
- Two prober fixtures meant to be clean contained a real small tension and were revised (see `notes` on `communication_clean` and `conflict_clean_with_skips`). The prober prompt is unchanged.

**Eval baseline (first live run, 2026-09-16):**

| Suite | Result |
| --- | --- |
| scoring goldens | 50/50 |
| synthetic couples (stage 1) | 20/20 |
| interpreter, 20 couples, Batches API | 20/20; one output needed a guardrail retry; couple_01 carried the OCI-R warning above |
| prober, 7 cases | seven runs: five at 7/7; the first probed `communication_clean` and the fifth probed `conflict_clean_with_skips`, each before that fixture was revised; the two runs after both revisions were 7/7 |
| sentiment flagger, 5 cases (`--suite sentiment`) | 5/5, run under 2026.09.16-1; the sentiment prompt is unchanged |

One full run (`pnpm evals`) made 55 model calls: 21 interpreter, 8 prober and 26 guardrail. Using the prices in `config/llm.ts`, that is about $0.73 interpreter after the Batches API discount, $0.25 prober and $0.05 guardrail, so about $1.03 per full run. Two of the seven prober runs needed one guardrail retry each, and both retries succeeded.

## 2026.09.16-1

- The item-descriptor reference (item ID to descriptor for every instrument, plus the unvalidated list) moved out of the dynamic input into a second static system block for the interpreter, prober and summarizer, so it sits under the prompt-cache breakpoint (cost control 1). Input shape sections of `interpreter.v1.md` and `prober.v1.md` updated accordingly; reading rules unchanged. No eval baseline existed before this change.

## 2026.09.15-1

- Initial versions: `interpreter.v1`, `prober.v1`, `summarizer.v1`, `sentiment_flagger.v1`, `guardrail.v1`, `concreteness.v1`.
- Models: prober on `claude-fable-5-1` with server-side fallback to `claude-opus-5`; interpreter, summarizer and sentiment_flagger on `claude-sonnet-5`; guardrail and concreteness on `claude-haiku-4-5-20251001`.
- Temperature 0 for every role except summarizer (0.3). Sent only to models that accept sampling parameters (Haiku 4.5); Fable 5.1, Opus 5 and Sonnet 5 reject `temperature` and run with `output_config.effort` instead (see `config/llm.ts`).
- Structured output: forced tool for every model that supports it; Fable 5.1 rejects forced tool choice, so the prober uses `tool_choice: auto` with a strict tool and an explicit instruction, and a turn without a tool call is treated as a validation failure.
- No eval baseline was recorded for this version; the first live run is under 2026.09.16-2.
