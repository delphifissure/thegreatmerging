# Question inventory

Every question the system asks, in one place. Two kinds of content are here, and the distinction matters:

- **Validated instruments.** Described at the level of what the items ask about, with item counts, scoring, and sources. Item text is not reproduced; use the official text from each source so the norms apply. These fill `config/instruments/*.json`.
- **Original questions.** Written for this system, reproduced verbatim, and labeled unvalidated wherever they produce a score. These fill `config/color_modules/*.json`, the polarization block, and the Square One mode.

Approximate load per person: about 100 scored items in Layer 0 (118 with the optional OCI-R), about 300 in Layer 1 (318 with the optional PRQC), most of them one-tap scale responses. Then 5 to 30 written answers in the color layer depending on how many domains flag.

---

## Part A. Validated instruments

### Layer 0 (individual)

| Key | Instrument | Items | What the items ask | Scores | Source |
|---|---|---|---|---|---|
| mini_ipip | Mini-IPIP | 20 | Short self-descriptions across sociability, sympathy, orderliness, mood stability, imagination | Five Big Five scores | Donnellan et al. 2006; ipip.ori.org (public domain) |
| ecr_r | ECR-R | 36 | Worry about abandonment or being unloved; discomfort depending on or opening up to a partner | Attachment anxiety, attachment avoidance | Fraley, Waller & Brennan 2000 (free) |
| phq9 | PHQ-9 | 9 | Two-week frequency of low mood, anhedonia, sleep, energy, appetite, concentration, self-worth, psychomotor change, one safety item | Depression severity; cutoffs 5/10/15/20 | Kroenke et al. 2001 (public domain) |
| gad7 | GAD-7 | 7 | Two-week frequency of nervousness, worry, restlessness, irritability, dread | Anxiety severity; cutoffs 5/10/15 | Spitzer et al. 2006 (public domain) |
| sis_ses_sf | SIS/SES-SF | 14 | What turns arousal on; what shuts it off via performance worry; what shuts it off via fear of consequences | Excitation; inhibition-performance; inhibition-consequences | Carpenter, Janssen et al. 2008 |
| sdi2 | SDI-2 | 14 | Frequency and strength of desire for sex with a partner and alone | Dyadic desire; solitary desire | Spector, Carey & Steinberg 1996 |
| oci_r | OCI-R (optional) | 18 | Distress from checking, ordering, washing, hoarding, obsessing, neutralizing | Total (cutoff 21); six subscales | Foa et al. 2002 |

### Layer 1 (relationship)

| Key | Instrument | Items | What the items ask | Scores | Source |
|---|---|---|---|---|---|
| csi16 | CSI-16 | 16 | Overall happiness, warmth, and reward in the relationship, on several scale types | Satisfaction 0–81; below 51.5 distressed | Funk & Rogge 2007 (free) |
| rdas | RDAS | 14 | How often you agree on money, religion, affection, friends, sex, conventions, life philosophy, in-laws, time together, decisions, household tasks; conflict frequency; shared activities | Consensus, satisfaction, cohesion; total cutoff 48 | Busby et al. 1995 |
| cpq_sf | CPQ-SF | 11 | When a problem arises, who raises it, who avoids, who pressures, who withdraws, whether you discuss constructively | Demand-withdraw both directions; constructive communication | Futris et al. 2010 |
| acq | Areas of Change | 34 × 2 passes | Pass 1: how much you want your partner to change on each of 34 behaviors. Pass 2: how much you think your partner wants you to change on each | Desired change per item; perceptual accuracy | Weiss, Hops & Patterson 1973 |
| fapbi | FAPBI | ~20 × 2 | For each partner behavior (affection, closeness, demands, violations): how often it happens, and how acceptable that frequency is | Frequency and acceptability per behavior | Doss & Christensen 2006 |
| who_does_what | Who Does What? | ~24 × 2 | Household tasks, decisions, childcare: who does each now, and how you'd like it, 1–9 from all-her to all-him | Now vs ideal per person; between-partner "now" agreement | Cowan & Cowan 1988 |
| brief_crs | Brief CRS | 14 | Whether the two caregivers agree, back each other up, undermine each other, expose the child to conflict, share the load | Seven subscales | Feinberg, Brown & Kan 2012 |
| map | MAP | 10 × 2 | Intensity of the problem in ten areas; then confidence you two can resolve each | Intensity and efficacy per area | Notarius & Vanzetti 1983 |
| psdq_sf | PSDQ short form | 32 | How often you reason with the child, show warmth, demand obedience, punish, avoid confrontation, let things slide | Authoritative, authoritarian, permissive | Robinson et al. 2001 |
| prqc | PRQC (optional) | 18 | Three items each on satisfaction, commitment, intimacy, trust, passion, love | Six component scores | Fletcher, Simpson & Thomas 2000 |

On every scored item, one control only: a checkbox, "this one needs context."

---

## Part B. Polarization block (original; unvalidated; in Layer 1)

For each dimension, two ratings on a 1 to 7 scale with the anchors shown, then one written question asked only if the two ratings differ by 2 or more.

Rating 1: **Left to yourself, where are you?**
Rating 2: **With your partner, where do you find yourself?**
Written: **If those differ: why do you think you shift?**

1. Structure with a child. 1 = loose, let it unfold; 7 = structured, planned, rules first.
2. Order in the home. 1 = mess doesn't bother me; 7 = it needs to be tidy for me to rest.
3. Emotional expressiveness. 1 = I keep feelings to myself; 7 = I say what I feel as I feel it.
4. Directness versus gentleness. 1 = I soften everything; 7 = I say it straight, however it lands.
5. Initiating affection. 1 = I wait to be approached; 7 = I reach first.
6. Planning versus spontaneity. 1 = I like things open; 7 = I need a plan.
7. Taking charge versus deferring. 1 = I let the other lead; 7 = I run things.
8. Caution versus risk. 1 = I assume things will be fine; 7 = I assume something could go wrong.
9. Social energy. 1 = I need a lot of time alone; 7 = I want people around most of the time.
10. Home versus work focus. 1 = home first; 7 = work first.

Mirror set, ten items, same anchors: **With me, my partner seems to become more ___.**

---

## Part C. Color layer (original; written answers; only where flagged)

### Asked in every flagged domain

- **Preference:** Describe what good would look like here, concretely, in your house, on an ordinary week.
- **Tag:** Is this a requirement, meaning the relationship doesn't work for you without it, or a preference, meaning you'd like it and could live without it? *(Required comment: what it means, and what it would look like met.)*
- **Perception gap** (only where the gap between your self-rating and your partner's rating of you is 2 or more): You rated yourself X on this and your partner rated you Y. What are you each seeing?
- **Context** (only for items you checkboxed): You flagged this one. What's the context?
- **Polarization** (only where your two ratings differ by 2 or more): You said that left to yourself you're at X on this, and with your partner you find yourself at Y. What do you think is going on?
- **Concreteness follow-up** (whenever an answer is abstract): Can you give me a specific example?

### Parenting

Opens on a PSDQ between-parent gap, Brief CRS flags, or the childcare rows of Who Does What.

*Dimension 1. Warmth and control, separately*
1. On a normal day, how do you show a child warmth? A concrete example from this week if there was one.
2. On a normal day, how do you enforce a limit? A concrete example.
3. Describe a moment where a child was corrected well. What made it good?

*Dimension 2. What "respect" means*
4. Finish this sentence: A respectful child is one who ____.
5. Finish this sentence: A respectful parent is one who ____.
6. A child disagrees with an adult, out loud, and turns out to be right. What should happen?
7. A child asks a blunt, curious question about an adult's body, clothes, or choices, in front of others. Is that disrespect, curiosity, or something else? What do you do?
8. Tag: whether children may question adults; what a child owes an adult versus what an adult owes a child.

*Dimension 3. Self-expression versus structure*
9. How much of a child's day should be planned versus open? Describe your ideal weekday.
10. A child wants to do something unusual (in clothing, interest, behavior) that isn't harmful. What's your response?
11. How involved should a parent be in a child's friendships, schoolwork, and activities? Where's the line between supporting and controlling?
12. Describe the balance of structure and freedom you'd want for a child at this age.
13. Tag: daily structure; how much a child directs their own interests.

*Dimension 4. Modeling*
14. Name something you expect from a child that you also hold yourself to.
15. Name something adults in the house do that you would not want the child to copy.
16. Is it fine for adults to use language or habits around a child that the child isn't allowed to use? Where's the line?
17. Tag: adults modeling what they require.

*Dimension 5. Discipline mechanics*
18. When a limit is broken, what happens, step by step?
19. What's off the table entirely as a response to a child?
20. Who handles correction when both adults are present, and what does the other do?
21. When adults disagree about a child in the moment, what happens in front of the child, and what happens after?
22. Tag: specific methods; disagreeing in front of the child; who has final say.

*Dimension 6. Roles in a multi-caregiver home*
23. What's each adult's role with the child, and how did you decide it?
24. When does a non-primary caregiver correct the child, and when do they hand it to the primary parent?
25. What does backing each other up mean, and what does it not require?
26. Tag: who disciplines; how a newer caregiver earns standing.

### Intimacy and affection

Opens on FAPBI affection or closeness flags, an SDI-2 dyadic gap, or MAP sex intensity.
1. One of you initiates a kiss with no other intention and the other isn't in the mood. Write the exchange.
2. What's the smallest thing your partner could do that would make you feel wanted this week?
3. Describe an ordinary good week, with affection in it, under current circumstances. Then a year from now.
4. Tag: scheduled time; advance notice; what counts as intimacy.

### Communication and nonverbal

Opens on CPQ-SF demand-withdraw or ACQ communication items.
1. Your partner's face looks angry and you don't know if they are. What do you do? What should they do?
2. Your partner has been quiet for two days. What do you assume, and what do you do?
3. When you're upset, how do you want to be approached, in words you'd actually use?
4. Write-in: When my face looks upset, what's usually going on is ____.
5. Tag: gentleness of delivery; being asked versus being read.

### Conflict and repair

Opens on the RDAS satisfaction subscale, MAP communication intensity, or FAPBI violations.
1. One of you says something hurtful in a fight. Ten minutes later, what happens? The next morning?
2. What does a pause in a fight mean to you, and what would make you trust that it isn't abandonment?
3. Describe a fight that went as well as a fight can.
4. Tag: apology; volume; being able to be wrong and stay in the room.

### Household

Opens on Who Does What flags.
1. One of you wants to reorganize a shared space the other uses. What's the right way to go about it?
2. On the tasks that flagged, describe the split you'd actually be content with.
3. Tag: each other's things and spaces; guests without notice.

### Self-care and health

Opens on FAPBI or ACQ health behaviors, or the MAP alcohol area.
1. A doctor recommends something and the person doesn't want to do it. What's the partner's role?
2. Your partner comes home after a drink with a friend you didn't know about. What do you do, and what did you want them to do?
3. What do you want your partner to say when they're worried about you?
4. Tag: notice; comment; space when stressed.

### Friends, family, and the long term

Opens on RDAS consensus flags for friends, in-laws, or life philosophy; MAP in-laws or friends; PRQC commitment.
1. One of you wants four days away without the kids. Who covers, and what's a fair ask?
2. A parent is coming over. Ground rules, and who sets them?
3. Five years from now, describe a good Tuesday evening in your house.
4. Tag: separate social time; family in the home; where you live.

---

## Part D. Consistency probes (the only forms the prober may use)

At most three per domain, one at a time, to that person only, reason attached, skip allowed.

1. You answered X here and Y in [domain]. Help me understand how those fit together.
2. Your [score] suggests [pattern], and here you said [the opposite]. How do those fit for you?
3. You rated yourself high on [behavior], and your scenario answers here are mostly about [contrasting behavior]. Help me see how those fit.
4. What's the value under this?
5. What would it look like if your partner did the thing you said you'd do?
6. Is this a preference or a requirement?
7. What would change your mind?

Parenting-specific patterns the prober watches for: high self-rated warmth with scenario answers that are all control; respect defined as obedience alongside adult conduct the person wouldn't accept from the child; an easygoing self-description with no structure the person can name.

---

## Part E. The plan (what gets written, per item)

- The topic.
- What we agreed.
- What A does.
- What B does.
- When we look at it again.

Parenting plans must also contain five named lines: children questioning adults; who corrects and how; structure versus freedom for this child at this age; the language and modeling standard adults hold; the protocol for adults disagreeing in front of the child.

Revisit question, per due item: **Still true?**

---

## Part F. Extended caregivers and children (original)

### Third caregiver
Adjusted Brief CRS; a Who Does What column for their tasks; PSDQ if they take real caregiving time. Then:
1. What help do you want from the household?
2. What help are you able to give?
3. What role would you like with the child?
4. What would you prefer the household not do?

### Child (kitchen-table conversation, adults present, never a form)
1. What makes home feel safe and good to you?
2. When a grown-up is upset about something, how do you like them to tell you?
3. What's something you'd like to do with each grown-up, just the two of you?
4. What's a house rule you think is fair? What's one you think isn't?
5. When you have a question about something a grown-up does, what should you do?
6. What should a grown-up do if you say something and they don't like it?
7. What do you want a new baby to know about you?

The adults answer 5 and 6 as well.

---

## Part G. Square One (single-user screening mode; original; no scoring)

Before the first date, the user writes a requirements list: the five things the relationship doesn't work without.

*Tier 1, the first few dates*
1. How did your last relationship end? And the one before that?
2. What did your parents' marriage look like from the inside?
3. What's the longest you've lived with a partner, and how did it go?
4. What do you do when you're wrong? Tell me about the last time.
5. What's something you've changed about yourself in the last five years, on purpose?
6. When you're stressed, do you want people or space? How much?
7. What's your relationship with your family now?
8. How do you feel about kids: having them, being around them, other people's?
9. What does a good weekend look like?
10. What do you do for fun that has nothing to do with dating or work?
11. How do you handle money?
12. What's your relationship with alcohol or anything else?

*Tier 2, month two or three*
13. What's a boundary of yours that partners have struggled with?
14. When you're upset with someone close to you, what do you actually do?
15. What makes you feel wanted?
16. What does your desire run on? Has it changed across relationships?
17. What's something a past partner said about you that stung because it was partly true?
18. Do you think people change?
19. What scares you about commitment?
20. How do you feel about therapy? Have you gone? Would you?
21. What did your worst year look like, and how did you get through it?
22. How do you treat people who have less power than you?

*Tier 3, before moving in*
23. Who does what in the house? Say it task by task.
24. What are your rules about your things and your space?
25. How much alone time do you need in a week? In hours.
26. What happens the first time we have a real fight under one roof?
27. What's off the table for you in bed, and what do you need?
28. How do we handle each other's family in our home?
29. What's your five-year picture: where, doing what, with whom?
30. What would make you leave? What would make you stay through something hard?

*Observe instead of asking*
- How they treat a waiter, a driver, a cashier.
- What happens the first time you disagree about something small.
- What happens the first time you're sick or low.
- Whether they ask about you, and remember the answers a week later.
- Whether they can be teased, and tease without cruelty.
- What they do when plans change without warning.
- Whether they ever say sorry, unprompted, for something small.
- What they fill their head with when no one's watching.

Per question, the mode records: notes, and a checkbox, "raised an eyebrow."
