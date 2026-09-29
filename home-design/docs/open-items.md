# Open items

Carried from [PLAN.md](PLAN.md), with what Phase 0 added. Owner in brackets.

## Blocking Phase 0

- [x] Set the RunPod spending cap for benchmark runs: $50 for Phase 0, API and GPU together [Dane]
- [ ] Add an Anthropic API key to the cloud environment as `ANTHROPIC_API_KEY`, then start a
      new session so it is picked up. Needed for the Claude runs and for the IFC-Bench judge [Dane]
- [ ] Give the BIM-Edit harness repository URL (it is linked in the arXiv paper), or allow
      `arxiv.org` in the environment's network settings [Dane]
- [ ] Decide whether a Claude BIM-Edit run may use a subset: the paper's full Sonnet 4.6 run
      cost $197.94, about four times the cap (see docs/gates/phase-0.md) [Dane]

## Blocking later phases

- [ ] Choose the lot, either the hypothetical unincorporated parcel or a real Frederick County parcel
- [ ] Get access to the adopted code text for verifying rule interpretations, through ICC Digital Codes or the county
- [ ] Download and review the ECPPM 2026 paper by Du, Hellin, Fuchs and Borrmann from Zenodo
- [ ] Confirm whether ARCHER picked its best checkpoints on training data or test data
- [ ] Confirm the 2024 code adoption date and the county effective date
- [ ] Ask the county whether a geotechnical report is required in mapped carbonate areas
- [ ] Ask the county whether remote video inspections are still accepted
- [ ] Ask the county whether new one- and two-family homes must have sprinklers
- [ ] Ask the county for blower door and duct leakage limits, permit and impact fees, and any perc test season
- [ ] Confirm whether an owner who is not a registered builder may submit self-prepared drawings
- [ ] Price licenses for WUFI Pro and RSMeans data
- [ ] Check whether UpCodes offers a developer API
- [ ] Find a licensed reviewer for the Phase 5 sample
- [ ] Confirm which countries the ResPlan listings come from
- [ ] Choose product and price data sources for the catalog, and check their terms of use
- [ ] Line up one builder or architect willing to receive the handoff package

## Found during Phase 0

- [ ] Check the rebuilt BIM-Edit `tasks.jsonl` against the official one
- [ ] Read the IFC-Bench paper's judging protocol (Hellin et al. 2026, arXiv 2605.01698, also
      blocked here) and align our judge with it, or report both
- [ ] The BIM-Edit paper's "no model fully solves more than 3.4%": the published runs give
      at most 10 of 323 tasks (3.1%, Qwen 3.6 Plus) at a score of exactly 1. Find the
      paper's threshold
