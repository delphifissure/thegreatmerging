# Open items

Carried from [PLAN.md](PLAN.md), with what Phase 0 added. Owner in brackets.

## Blocking Phase 0

- [x] Set the RunPod spending cap for benchmark runs: $50 for Phase 0, API and GPU together [Dane]
- [x] Claude runs and the judge: no API key. They go through headless Claude Code on the
      Claude plan (decided by Dane 2026-09-29)
- [x] BIM-Edit harness: the paper (v3) links no code repository; the scorer was rebuilt from
      appendix E and calibrated on the published runs (docs/gates/phase-0.md)
- [ ] Ask the BIM-Edit authors for the release package (harness, evaluator, task metadata)
      and report the delete-task semantics bug [Dane]
- [ ] Read the IFC-Bench paper's protocol (arXiv 2605.01698, still blocked in this session)
- [x] Sonnet 5.5 on IFC-Bench and the 18-task BIM-Edit subset (done)
- [ ] Decide whether to extend BIM-Edit to all 162 artificial or all 324 tasks, and whether to
      add a second Claude model [Dane]
- [ ] Approve or reject the Phase 0 gate (docs/gates/phase-0.md) [Dane]

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
- [x] The BIM-Edit paper's 3.4%: solved means all three metrics >= 0.98; reproduced exactly
