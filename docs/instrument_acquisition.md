# Populating the instruments: instructions for personal use

Personal use between two people needs no ethics review and no license negotiation. It does need the exact official item text, the exact scoring key, and a citation, so the published norms apply. This document tells you where each instrument lives and how to get it into the app.

## The procedure, for every instrument

1. Get the official version. For most, that's the appendix of the original journal article or the author's lab page. Where the instrument is distributed on request, email the author (template at the end).
2. Create `config/instruments/<key>.json` from the schema in the build prompt. Copy every item word for word, in the original order, with the original response anchors. Do not paraphrase, shorten, modernize, or reorder.
3. Copy the scoring key: which items are reverse-scored, how subscales are formed, the scale minimum and maximum, and any published cutoffs. Put it in the `scoring` block.
4. Fill `source_citation` with the full reference and `license_note` with the terms as stated by the source (for example, "Free for research and clinical use; authors ask to be cited" or "Public domain"). The app refuses to load a file with an empty license note.
5. Run `pnpm vitest run instruments`. The test that fails while any item text still reads "TODO" should now pass for that instrument. Then run that instrument's golden test.
6. Keep the repository private. Personal use covers you; publishing the item text does not.

Budget: about an afternoon for the freely downloadable ones, plus a few days of email turnaround for the two that are distributed on request.

## Where each instrument lives

Links change and I won't guess at them; each entry gives you the exact citation and the search that finds it.

### Public domain (start here, twenty minutes total)

**PHQ-9.** Search "PHQ-9 official PDF." The instrument is public domain and hosted by countless health systems; use any copy that shows the nine items, the four-point frequency scale (not at all / several days / more than half the days / nearly every day), and the difficulty item at the bottom. Cutoffs 5, 10, 15, 20. Item 9 is the safety item; the app handles it specially.

**GAD-7.** Search "GAD-7 official PDF." Same scale, seven items, cutoffs 5, 10, 15.

**Mini-IPIP.** Go to the International Personality Item Pool site (ipip.ori.org) and search its scales for "Mini-IPIP." The page lists the twenty items with the keying (+ or −) for each of the five factors. Five-point agreement scale.

### Free downloads (an afternoon)

**ECR-R.** R. Chris Fraley hosts the instrument on his lab page at the University of Illinois; search "Fraley ECR-R items scoring." The page gives all 36 items, the seven-point scale, which items are reverse-scored, and how to compute the anxiety and avoidance means. Cite Fraley, Waller & Brennan (2000), Journal of Personality and Social Psychology.

**CSI-16.** Funk, J. L., & Rogge, R. D. (2007). Testing the ruler with item response theory. Journal of Family Psychology, 21(4), 572–583. The items appear in the article's appendix, and Ronald Rogge's lab at the University of Rochester distributes the CSI forms; search "Rogge CSI-16 form." Note the mixed response formats: one item on a seven-point happiness scale, others on six-point agreement or frequency scales. Range 0–81, cutoff 51.5.

**RDAS.** Busby, D. M., Christensen, C., Crane, D. R., & Larson, J. H. (1995). A revision of the Dyadic Adjustment Scale. Journal of Marital and Family Therapy, 21(3), 289–308. Fourteen items in the article; three subscales; total cutoff 48. Also reproduced in many dissertations if the article is behind a paywall.

**CPQ-SF.** Futris, T. G., Campbell, K., Nielsen, R. B., & Burwell, S. R. (2010). The Communication Patterns Questionnaire–Short Form. Family Relations, 59(5), 552–562. Eleven items in the article. The full CPQ is also distributed through Andrew Christensen's UCLA lab materials, which is where the scoring conventions live; search "Christensen Communication Patterns Questionnaire."

**Areas of Change Questionnaire.** Weiss, R. L., Hops, H., & Patterson, G. R. (1973). A framework for conceptualizing marital conflict. In Hamerlynck, Handy & Mash (Eds.), Behavior Change. The 34 items and the two-pass format are reproduced in Christensen's IBCT assessment materials and in many later papers; search "Areas of Change Questionnaire items." Two passes: "I would like my partner to…" and "It would please my partner if I…", each rated −3 to +3.

**FAPBI.** Doss, B. D., & Christensen, A. (2006). Acceptance in romantic relationships: The Frequency and Acceptability of Partner Behavior Inventory. Psychological Assessment, 18(3), 289–302. Items and the two-rating format (frequency, then acceptability) are in the article; also on Christensen's UCLA site.

**Brief CRS.** Feinberg, M. E., Brown, L. D., & Kan, M. L. (2012). A multi-domain self-report measure of coparenting. Parenting: Science and Practice, 12(1), 1–21. The full 35-item CRS and the 14-item brief version are in the article; Mark Feinberg's group at Penn State's Prevention Research Center shares the measure on request. Change "our child" to the child's name in the app display only, never in the stored item text.

**MAP.** Notarius, C. I., & Vanzetti, N. A. (1983). The Marital Agendas Protocol. In E. Filsinger (Ed.), Marital Interaction: Analysis and Modification. Sage. Ten problem areas rated for intensity, then for confidence in resolving each. The item set is short and reproduced in later relational-efficacy papers if the chapter is hard to find; search "Marital Agendas Protocol relational efficacy."

**PSDQ short form.** Robinson, C. C., Mandleco, B., Olsen, S. F., & Hart, C. H. (2001). The Parenting Styles and Dimensions Questionnaire. In Perlmutter, Touliatos & Holden (Eds.), Handbook of Family Measurement Techniques, Vol. 3. Sage. The 32-item short form and its three-style keying are reproduced in many papers; search "PSDQ short form 32 items." Five-point frequency scale. The authors permit research use with citation.

**PRQC.** Fletcher, G. J. O., Simpson, J. A., & Thomas, G. (2000). The measurement of perceived relationship quality components. Personality and Social Psychology Bulletin, 26(3), 340–354. Eighteen items in the article, three per component, seven-point scale.

**SDI-2.** Spector, I. P., Carey, M. P., & Steinberg, L. (1996). The Sexual Desire Inventory. Journal of Sex & Marital Therapy, 22(3), 175–190. Fourteen items in the article; dyadic and solitary subscales scored separately.

**OCI-R.** Foa, E. B., et al. (2002). The Obsessive-Compulsive Inventory: Development and validation of a short version. Psychological Assessment, 14(4), 485–496. Eighteen items in the article, five-point distress scale, total cutoff 21, six subscales. Freely used with citation.

### Distributed on request (email now; they take days)

**SIS/SES-SF.** Carpenter, D., Janssen, E., Graham, C., Vorst, H., & Wicherts, J. (2008). Women's scores on the Sexual Inhibition/Sexual Excitation Scales (SIS/SES): Gender similarities and differences. Journal of Sex Research, 45(1), 36–48. The 14-item short form and scoring are distributed by the Kinsey Institute; search "Kinsey Institute SIS/SES request." Use the email template below.

**Who Does What?** Cowan, C. P., & Cowan, P. A. (1988). Who does what when partners become parents. Marriage & Family Review, 12(3–4), 105–131. The measure comes from the Cowans' Becoming a Family Project at UC Berkeley and is shared with researchers on request; versions of the task list also appear in later papers on division of labor. Email template below. If the response is slow, the RDAS consensus items on household tasks and the childcare rows can stand in temporarily, marked as a partial substitute in the config.

## Request email template

Subject: Request to use [instrument name] for personal, non-commercial use

Dear [Dr. Name],

I'm writing to request a copy of the [instrument name] and its scoring instructions. I intend to use it for personal, non-commercial purposes only: a self-administered assessment between my partner and me, not a study, not a product, and not for redistribution. I will cite [citation] wherever the measure appears.

If there are conditions on its use I should know about, I'll follow them.

Thank you for your work on this measure.

[Your name]

## Transcription checklist

For every file, before you mark it done:

- Items are verbatim, in the original order, including any items that are intentionally awkward or redundant.
- Response anchors match the original exactly, including the number of scale points and the wording of each point.
- Every reverse-scored item is marked `"reverse_scored": true`.
- Subscale membership matches the published key item by item.
- Cutoffs are the published ones, with the direction correct (below versus at-or-above).
- `source_citation` is the full reference.
- `license_note` states the terms in the source's own words or a faithful summary.
- The golden test for that instrument passes using a worked example from the article or scoring guide.

## What personal use does and doesn't cover

It covers administering these to yourselves, electronically, unmodified, with citation, for as long as you like. It doesn't cover publishing the item text, using the app with other couples, or charging anyone. If any of those becomes the plan, go back to each license note and, for anything involving other people, to an ethics review. The config design makes that a per-file update rather than a rebuild.
