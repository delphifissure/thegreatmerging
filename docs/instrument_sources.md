# Instrument sources and verification log

What was fetched from where, what it verified, and what the owner still has to obtain. Updated 2026-09-16 (PRQC and OCI-R added later that day). Rule followed throughout: no item text and no scoring key was written from memory; every populated field cites the fetched page in the instrument file's `source_url` / `text_source`.

## Populated (text, anchors and key from the official source)

| Key | Source fetched | Verified | License |
|---|---|---|---|
| `phq9` | Official PHQ-9 form (PDF hosted by the APA) | 9 items verbatim, 0–3 anchors, cutoffs 5/10/15/20, item 9 safety item | "No permission required to reproduce, translate, display or distribute" (printed on the form) |
| `gad7` | GAD-7 form as distributed by the ADAA (PDF) | 7 items verbatim, 0–3 anchors, cutoffs 5/10/15 | Same Pfizer permission statement as the PHQ family |
| `mini_ipip` | ipip.ori.org Mini-IPIP key page; IPIP 50-item page for instructions and the 1–5 scale | 20 items verbatim, factor membership and + / − keying, response scale | Public domain (quoted on ipip.ori.org) |
| `ecr_r` | R. Chris Fraley's lab page (ECR-R items) | 36 items verbatim, anxiety 1–18 / avoidance 19–36, reverse items 9, 11, 20, 22, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 1–7 scale | Distributed without charge on the lab page; cite Fraley, Waller & Brennan (2000) |
| `csi16` | Fetzer / Fincham "Self Report Measures for Love and Compassion Research" CSI-32 form with the note "For the 16-item version use 1, 5, 9, 11, 12, 17, 19, 20, 21, 22, 26, 27, 28, 30, 31, 32" | 16 items verbatim with printed scoring values (item 1: 0–6; others 0–5; four items and four bipolar pairs printed descending), total 0–81, cutoff 51.5 | Free for clinical and research use (Funk & Rogge 2007; Rogge lab) |
| `prqc` | Relationship Health Assessment (PRQC) form on relationshipscienceonline.com, the authors' site | 18 items verbatim, 1–7 scale ("not at all" … "extremely"), scoring section: satisfaction 1, 7, 13; commitment 2, 8, 14; intimacy 3, 9, 15; trust 4, 10, 16; passion 5, 11, 17; love 6, 12, 18 (the config had assumed grouped items and was corrected) | Distributed free by the authors' site; cite Fletcher, Simpson & Thomas (2000) |
| `oci_r` | OCI-R form ("Copyright by Edna B. Foa 2002") reproduced by the University of Washington Psychiatry Consultation Line; cutoff cross-checked in PMC4530108 | 18 items verbatim, 0–4 anchors, subscale membership consistent with item content, sum scoring, cutoff 21 per Foa et al. 2002 (the UW scoring page's alternative of 18 not adopted) | Freely reproduced for clinical and research use with citation |

## Key verified, text not populated (obtain the official form)

| Key | Source fetched | Verified | Still needed |
|---|---|---|---|
| `brief_crs` | Feinberg, Brown & Kan 2012, open-access full text (PMC3499623) | Brief form = CRS items 1, 2, 4, 5, 6, 9, 16, 20, 22, 24, 25, 27, 33, 34; subscale membership; reverse items CRS 9 and 20; 0–6 scale (exposure items 0 never … 6 very often); means | Item text (request the measure from Feinberg's group at Penn State or use the article appendix); confirm the brief form's administration order |
| `psdq_sf` | Portuguese CFA of the PSDQ short form (Redalyc) stating the original Robinson et al. 2001 assignment | Authoritative 15 (1, 3, 5, 7, 9, 11, 12, 14, 18, 21, 22, 25, 27, 29, 31), authoritarian 12 (2, 4, 6, 10, 13, 16, 19, 23, 26, 28, 30, 32), permissive 5 (8, 15, 17, 20, 24); 1–5 scale; means. Corrected items 4 and 17 versus the earlier assumed key | Item text (Robinson et al. 2001 short form) |

## Key not verifiable from what could be fetched

| Key | What the sources say | Config state |
|---|---|---|
| `cpq_sf` | Futris et al. 2010 abstract and summaries: 11 items, 1–9 scale, constructive communication = 3 items (3–27), demand/withdraw total = 6 items (6–54) from two directions; 2 items outside both. Full text returned 403 from the publisher and the CSUSB repository. | Current 7-item constructive subscale does not match; re-map from the article's Table 1 when the article is obtained. `scoring_key_verified: false` |
| `sis_ses_sf` | Velten et al. 2018 (PLOS ONE): 14 items, 1 strongly disagree … 4 strongly agree, no reverse coding in the German administration; the original Janssen convention runs the other way. Item-to-subscale assignment differs between sources. Measure distributed on request (Kinsey Institute; Erick Janssen). | Grouped by subscale, all items reverse-keyed under the original convention; check direction and assignment on the official form. `scoring_key_verified: false` |
| `sdi2` | Brazilian validation (PMC11554335): dyadic items 1–9, solitary 10–13, item 14 unscored; other papers: dyadic 1–8 (0–62), solitary three or four items. | Dyadic 1–8, solitary 10–13, total 0–93; resolve against Spector et al. 1996. `scoring_key_verified: false` |
| `rdas` | Busby et al. 1995 (not fetched this session; structure widely reproduced) | Consensus 1–6, satisfaction 7–10, cohesion 11–14 (item 11 0–4), cutoff 48. Confirm on the article's form. |
| `map`, `fapbi`, `acq`, `who_does_what` | Not fetched this session | Item counts and formats per docs/question_inventory.md; text and keys from the sources listed in docs/instrument_acquisition.md |

## Leads for the remaining ten (checked 2026-09-16)

| Key | Where to get it |
|---|---|
| `rdas` | Fetzer Institute "Self Report Measures for Love and Compassion Research: General Relationship Satisfaction" PDF (RDAS section; the form did not extract as text, so check it visually), or Busby et al. 1995 via ResearchGate or a library |
| `psdq_sf` | Robinson et al. 2001 chapter; a form titled "Parenting Styles & Dimensions Questionnaire – Short Version" is attached to a ResearchGate Q&A thread (blocked to automated fetches) |
| `sdi2` | Spector, Carey & Steinberg 1996 (Journal of Sex & Marital Therapy); needed to settle the dyadic 1–8 versus 1–9 question |
| `cpq_sf` | Futris et al. 2010 (Family Relations), Table 1 for which 11 items and how they are scored; full CPQ wording in the University of Utah "Communication Patterns Questionnaire 2016 revision" document |
| `fapbi` | Doss & Christensen 2006 (Psychological Assessment); ask Brian Doss's lab if the article is paywalled |
| `acq` | Weiss, Hops & Patterson 1973 or Margolin et al. 1983; library or interlibrary loan |
| `map` | Notarius & Vanzetti, "Marital Agendas Protocol", Handbook of Measurements for Marriage and Family (Taylor & Francis chapter 9) |
| `brief_crs` | Penn State ICOPAR request form: https://sites.psu.edu/icopar/request-to-use-the-crs/ |
| `sis_ses_sf` | Email Erick Janssen (template below); Kinsey Institute holds the copyright |
| `who_does_what` | Email the Cowans (template below) |

Put obtained files in `instrument-sources/` at the repo root (gitignored), then ask for them to be transcribed.

## Request emails (for the two measures distributed on request)

**SIS/SES-SF** (Kinsey Institute; Erick Janssen, erick.janssen@kuleuven.be)

> Subject: Request to use the SIS/SES-SF for personal, non-commercial use
>
> Dear Dr. Janssen,
>
> I'm writing to request a copy of the Sexual Inhibition/Sexual Excitation Scales – Short Form (SIS/SES-SF) and its scoring instructions. I intend to use it for personal, non-commercial purposes only: a self-administered assessment between my partner and me, not a study, not a product, and not for redistribution. I will cite Carpenter, Janssen, Graham, Vorst & Wicherts (2008), Journal of Sex Research, 45(1), 36–48, wherever the measure appears.
>
> If there are conditions on its use I should know about, I'll follow them.
>
> Thank you for your work on this measure.

**Who Does What?** (Carolyn Pape Cowan and Philip A. Cowan, Becoming a Family Project, UC Berkeley)

> Subject: Request to use the Who Does What? questionnaire for personal, non-commercial use
>
> Dear Drs. Cowan,
>
> I'm writing to request a copy of the Who Does What? questionnaire (household tasks, decisions and childcare; "how it is now" and "how I would like it") and its scoring instructions. I intend to use it for personal, non-commercial purposes only: a self-administered assessment between my partner and me, not a study, not a product, and not for redistribution. I will cite Cowan & Cowan (1988), Marriage & Family Review, 12(3–4), 105–131, wherever the measure appears.
>
> If there are conditions on its use I should know about, I'll follow them.
>
> Thank you for your work on this measure.

## How to finish

1. Obtain each remaining form (docs/instrument_acquisition.md lists where every one lives).
2. Transcribe items verbatim into `config/instruments/<key>.json`, set `source_url`, `text_source` and `license_note`, confirm the key item by item and set `scoring_key_verified: true`.
3. Run `pnpm check:instruments`, `pnpm vitest run instruments`, and `pnpm evals --suite scoring`.
