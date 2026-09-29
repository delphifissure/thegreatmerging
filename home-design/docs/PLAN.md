# AI Home Design Proof of Principle: Plan and Build Prompt

Sep 28, 2026 · @Dane Gobel

## Purpose and scope

The proof of principle takes one house from a plain-language brief to a permit-ready model. Every number comes from an industry-standard engine and every legal decision stays with a named person.

The first build is a detached two-story wood-frame house of about 2,000 square feet. It sits on a hypothetical lot in unincorporated Frederick County with a private well and septic. The run covers the style brief, the room program, the layout, the building model, code checks, one energy check, one wall moisture check, a cost takeoff and a county permit-package check.

Later phases add renovation from a scan, construction verification, lender draw evidence, landscaping and bespoke furniture. The language model writes requests against typed tools. Deterministic engines compute, checkers verify, and licensed people sign where Maryland law requires it.

## Near-term product

The first release is a design and pre-construction tool that stops one step short of the permit set. It produces a handoff package that a builder or architect takes to permit, and nothing in it claims to pass inspection.

What a user sees:

- Style from words or photos, resolved into real products with prices, such as named Benjamin Moore colors, a specific flooring SKU and a window series.
- Room-by-room editing, where a dragged room makes the plan re-solve and name the reason each other room moved.
- Blender Cycles renders with the lot's sun path through the seasons.
- A live budget in Uniformat II line items and an EnergyPlus energy estimate.
- A code pre-check with pass, fail or manual-check verdicts and IRC citations, each one labelled advisory.
- An export of the IFC 4.3 model, the specification, a product schedule and PDF sheets.

Data it collects for the permit-grade version:

- Every brief-to-specification conversion and every owner decision is logged. This is the dataset for testing the specification step, and none of the reviewed papers had one.
- Advisory verdicts are later compared with what architects and plan reviewers flag on the same designs. Each disagreement becomes a labelled rule test case.
- Estimated quantities and prices are compared with real builder bids to calibrate the cost engine.
- Scans of real houses, including the one Dane buys, give as-built models and scan data for the verification layer.

Structural engineering, permit sheets, inspection evidence and lender integration wait for the permit-grade version, because they need licensed partners and a working relationship with the county. The interface never uses the word compliant, keeps manual-check items visible and labels every verdict advisory.

In phase terms the release is Phases 0 to 2, the renders and cost from Phase 4, and the Phase 3 rules running in advisory mode. The county submission report and the licensed review in Phase 5 move to the permit-grade version.

## Adversarial review of the papers

The typed tool layer does most of the work. In ReliCAD, a plain coding agent given ReliCAD's own typed CAD interface reached 98.5% valid models, against 99.8% for the full multi-stage system. Most other headline numbers rest on small samples, single runs, a grader that is also the optimizer, or model versions that are already a generation or two old.

| Paper | Headline claim | What the evidence does not show | What we do instead |
| --- | --- | --- | --- |
| [BIM-Edit](https://arxiv.org/abs/2606.20146) (Nithyanantham, Kujat, Sesterhenn et al., arXiv, June 2026) | No model fully solves more than 3.4% of 324 IFC edits | The authors chose one raw code tool and a 20-call cap on purpose, to test out-of-the-box ability. Claude Sonnet 4.6 hit the cap on 46% of tasks, so its score partly measures the cap. Every task is a single-element edit. | Run BIM-Edit against our typed tools and publish the gap. Add multi-step edit tasks of our own. |
| [MCP4IFC](https://arxiv.org/abs/2511.05533) (Nithyanantham, Sesterhenn, Nedungadi et al., arXiv, Nov 2025) | An LLM can build and edit IFC through MCP tools | Generation was judged from pictures. The authors' own inspection found unjoined walls, no openings cut for doors and windows, no IfcSpace rooms, no materials, and furniture outside any storey. The 75.4% query score counted partial answers as correct. Only 8 editing tasks. | A tool call cannot finish without its IFC relationships. The wall join, the opening and the room come with the same call. |
| [ARCHER](https://arxiv.org/abs/2607.25566) (Anand, Tan, Teo, Tan, Singapore IMDA, arXiv, July 2026) | Checker accuracy rises from 0.47 to 0.85 | Ten rules, one training model and one test model per rule, 270 labelled test elements. One run per configuration with no spread reported. The paper reports the best checkpoint without clearly saying which split picked it. Expert authoring time is not counted. No Claude model tested. Rules are checked one at a time. | Generate many labelled test models per rule at the code limits, since our tools can build them. Run several seeds. Keep a held-out test set nobody tunes against. Track rules that depend on each other. |
| [Text2BIM](https://arxiv.org/abs/2408.08054) (Du, Esser, Nousias, Borrmann, Journal of Computing in Civil Engineering, 2026) | The checker loop improves generated models | The 30 Solibri rules used to repair the model are the same 30 used to grade it. Agents cut issue counts by deleting walls. The authors say the rules fall well short of code compliance and structural design. Needs licensed Vectorworks and Solibri. | Separate the checks used in the repair loop from the acceptance checks. Block deletion of structural elements without human approval. |
| [ReliCAD](https://arxiv.org/abs/2609.22325) (Zheng, Dong, Li et al., arXiv, Sept 2026) | 99.8% valid, IoU 0.875 | GPT-5.5 in Codex with ReliCAD's typed interface already reached 98.5% and 0.858. The extra stages add about 1.3 points. IoU is computed only on valid outputs. Edit instructions were written by GPT-5.5. Mechanical parts only. | Spend the effort on the typed interface. A house spec can be checked item by item exactly (room area, door count, adjacency), so no IoU score and no model judging renders. |
| [Text2CAD-Bench](https://arxiv.org/abs/2605.18430) (Wang, Meng, Xiang et al., arXiv, May 2026) | Models fail on complex topology | Tested GPT-5.2 and Claude 4.5 Sonnet, both superseded. The real-world tier is graded by a vision model, spot-checked by three people. CadQuery only. | Re-run on current models before ruling out sweeps and lofts for furniture. |
| [Madireddy, Gao, Din et al.](https://arxiv.org/abs/2506.20551) (University of Houston, arXiv, June 2025) | LLMs can write IRC checks inside Revit | Success meant the script ran. Timings were reported by the models themselves. No labelled ground truth. The rule table has a 25% window-to-wall cap that is not in the IRC and an office ventilation rule from the IMC. | Use it only as a list of rule topics. Write every rule from the adopted code text. |
| [HouseDiffusion](https://arxiv.org/abs/2211.13287) (Shabani, Hosseini, Furukawa, CVPR 2023) | Best graph-to-plan generator of its time | Trained on single-floor Asian apartments from RPLAN at 256 by 256 pixels. Scored on realism and variety, with no dimensions and no code. Superseded by 2026 work that handles room sizes. | The constraint solver generates layouts. Track the newer work listed below. |
| [BIMgent](https://arxiv.org/abs/2506.07217) (Deng, Du, Nousias, Borrmann, arXiv, 2025) | GUI agents can model buildings | 32% end to end on 25 tasks | Not used. |
| [CAD-Recode](https://arxiv.org/abs/2412.14042) (Rukhovich, Dupont, Mallis et al., ICCV 2025) | Point cloud to CadQuery code | Trained on one million synthetic sketch-and-extrude parts. No evidence on buildings. | Furniture scanning only. |
| [You, Chen, Xue](https://frankxue.com/pdf/you26automated.pdf) (Automation in Construction 182, 2026) | Four-step scan-to-BIM guideline | A review of 58 cases with no accuracy or tolerance figures | Take tolerances from ACI 117 and trade standards. |
| [Gautam, Acharya, Kleeman, Foster](https://arxiv.org/abs/2607.00015) (RMIT, arXiv, 2026) | Rule-engine framework for apartment compliance | One feasibility case on Australian apartment rules. Dimensions read from drawings came out wrong, such as 17'4" for 11'4". | A model never reads dimensions off a drawing for a code check. |
| [City of Seattle CivCheck pilot report](https://www.seattle.gov/documents/Departments/Performance/Publications/2026CivCheckEvaluationReport.pdf) (2026) | 92% reviewer agreement in plan review | 93.1% of checks got no reviewer feedback and the report counts silence as agreement. Against final decisions, 6.4% of checks passed items that needed correction. 35 of 90 intake rejection reasons were outside the tool. Samples were 29 and 57 applications. The vendor tuned the checks during the pilot. | Report the false-pass rate as the main safety number. Start with submission completeness screening. |

The ECPPM 2026 paper by Du, Hellin, Fuchs and Borrmann was not reviewed because the file saved as a bot-check page. The PDF is on [Zenodo](https://zenodo.org/records/22679659).

Newer work that lets us do better:

- Lara and seven co-authors, ["Generative Floor Plan Design with LLMs via Reinforcement Learning with Verifiable Rewards"](https://arxiv.org/abs/2605.14117) (arXiv, May 2026), fine-tune an LLM on real plans and then train it against checkable room-size and connectivity targets. Our executable IRC rules are checkable targets, so this is a later RunPod path for a layout proposer.
- Abouagour and Garyfallidis, ["ResPlan"](https://arxiv.org/abs/2508.14006) (Indiana University, arXiv, Aug 2025), publish 17,000 cleaned vector floor plans with room graphs from public real-estate listings. Plans are single floor and the paper does not say which countries they come from. It can score whether solver layouts resemble real homes.
- Hellin, Jang, Fuchs, Nousias, Borrmann, ["Agentic Search for BIM Information Extraction"](https://doi.org/10.1016/j.autcon.2026.107260) (Automation in Construction 192, 2026), publish [IFC-Bench](https://huggingface.co/datasets/sylvainHellin/ifc-bench) with a fixed 514-question test split. We use it to test our read tools.
- Gao, Hu, Chai, Weng, Li, ["Multi-agent framework for schema-guided reasoning and tool-augmented interaction with IFC models"](https://www.sciencedirect.com/science/article/pii/S0926580526001299) (Automation in Construction 186, 2026), hard-code property and quantity extraction as fixed tools, which matches our rule that totals come from code.
- Every benchmark above tested models that are now one or two generations old. We re-run BIM-Edit, IFC-Bench and our rule tests on current Claude models and one open-weights model on RunPod before fixing the model choice.

## Design rules that follow from the evidence

Twelve rules govern the build. Each one answers a failure seen in the papers.

1. Every write to the building model goes through a typed tool. The tool checks its preconditions, creates the IFC relationships itself (storey containment, openings cut into walls, doors and windows filling them, wall joins, room boundaries) and returns a structured diff. MCP4IFC and BIM-Edit both failed on missing relationships.
2. Areas, counts, quantities and takeoffs are computed by fixed functions. Both models in MCP4IFC answered only 43.8% of questions that needed counting or summing.
3. Free code runs only read-only, in a sandbox, with a call budget and a stop condition. Claude Sonnet 4.6 ran out of calls on 46% of BIM-Edit tasks.
4. The control loop is fixed in code as planner, generator and evaluator. ARCHER's fixed loop beat an agent-orchestrated loop on all four models.
5. The brief becomes a written design specification before any geometry exists. Ambiguities are resolved with the user first. Every spec item is a measurable assertion checked after every change, following ReliCAD.
6. The layout comes from a constraint solver, Google OR-Tools CP-SAT. The model turns the brief into a room program and preferences, and the solver places the rooms. Text2BIM agents failed on open-ended spatial conflicts.
7. Each code rule has a plain-English interpretation written from the adopted code text, labelled pass and fail test models, and one of five verdicts: PASS, FAIL, ALERT, MANUAL\_CHECK or NA. Our own tools generate test models at the code limits.
8. The checks used to repair a model are kept apart from the acceptance checks, and the repairing agent never sees the acceptance set. Deleting a structural element needs human approval. Text2BIM agents deleted walls to lower their issue count.
9. The main safety number is the false-pass rate, meaning items the system passed that a person would reject. Seattle's pilot passed 6.4% of items that needed correction.
10. No model reads dimensions from an image for a code check. Images feed style choices only.
11. Every artifact is hashed and logged with the change that made it, the checks it passed and the person who reviewed it.
12. The model choice is made on our own benchmark runs with current models, repeated when a new model ships.

## System architecture

Claude writes the specification and the tool calls, and nothing else. The solver, engines and checkers are deterministic, and failed verdicts return to the fixed control loop.

&#91;embedded content: system architecture · one record, typed writes, read-only checks\]

The typed tool server is the only path that writes the IFC 4.3 model. Engines and checkers read the model and never change it. A change counts as done only when its spec assertions, code rules and IDS checks pass and the ledger records who reviewed it.

## Standard vocabulary and data sources

Every element, property and product in the model maps to a published standard so outputs load into validated tools and purchasing systems without translation.

| What it covers | Standard or source | Use in the build |
| --- | --- | --- |
| Building model | IFC 4.3 (ISO 16739-1:2024), read and written with IfcOpenShell and Bonsai | The single record |
| Required information | buildingSMART IDS, checked with IfcTester | Data the permit set must carry |
| Property names and units | buildingSMART Data Dictionary (bSDD) | Every property the tools write |
| Early cost | Uniformat II | Elemental estimate from the layout |
| Specification and purchasing | MasterFormat | Spec sections, bid packages, bill of materials |
| Spaces and products | OmniClass Tables 13 and 23 | Room and product classes |
| Level of detail | BIMForum LOD Specification | LOD 300 for the permit set, LOD 350 for structure and rough-in coordination |
| Product identity | Manufacturer SKU plus UL Product iQ listing or ICC-ES evaluation report number | Purchasing and proof of listing |
| Handover data | COBie | Operations and maintenance dataset at occupancy |
| Weather | TMY3 weather files in EPW format | Energy, moisture and sun position, from one file |
| Unit costs | RSMeans (Gordian) with a Frederick location factor | Cost takeoff, license terms open |
| Real-home layout reference | ResPlan, 17,000 vector plans | Scoring whether solver layouts resemble real homes |

## Frederick County code and permit facts

The county enforces the 2021 IRC with Maryland and county amendments, and Maryland is partway through moving to the 2024 editions. The rule base therefore carries both editions, keyed by permit application date. Facts marked verified come from the sources linked in the table, gathered in the September 2026 research report.

| Fact | Status | Source |
| --- | --- | --- |
| County enforces the 2021 IRC with state and county amendments for applications filed from July 20, 2024 | Verified | [County regulations page](https://www.frederickcountymd.gov/7989/Regulations-and-Ordinances) |
| County replaces IRC Chapter 24 with the 2021 IFGC and Chapters 25 to 33 with the county-adopted IPC | Verified | [Frederick County Code 1-6-18B](https://codelibrary.amlegal.com/codes/frederickcounty/latest/frederickco_md/0-0-0-17672) |
| Radon appendix adopted, with the passive vent pipe run straight through the roof and no single offset over 45 degrees | Verified | [Frederick County Code 1-6-18B](https://codelibrary.amlegal.com/codes/frederickcounty/latest/frederickco_md/0-0-0-17672) |
| Work on existing buildings falls under the Maryland Building Rehabilitation Code | Verified | [Frederick County Code 1-6-18B](https://codelibrary.amlegal.com/codes/frederickcounty/latest/frederickco_md/0-0-0-17672) |
| Maryland proposed the 2024 IBC, IRC and IECC in the Maryland Register on June 26, 2026, with comments closed July 27, 2026 | Verified | [Maryland Building Codes Administration](https://www.labor.maryland.gov/labor/build/buildnews.shtml) |
| Final state adoption date and county effective date for the 2024 codes | Open | Ask the county |
| The county issues building permits everywhere except the City of Frederick and Mount Airy | Verified | [County permits page](https://frederickcountymd.gov/8000/Building-Permits-Zoning-Certificates) |
| A builder designing its own single-family house does not need an architect's seal | Verified | [Maryland Business Occupations 3-103](https://law.justia.com/codes/maryland/2005/gbo/3-103.html) |
| A new-home permit needs the builder's Maryland Home Builder Registration number | Verified | [County single-family checklist](https://frederickcountymd.gov/DocumentCenter/View/4829/Building-Single-Family-Dwelling-Packet?bidId=) |
| Perc test by a county sanitarian, at least three pits, 30 minutes per inch for a conventional system or 60 for a sand mound, 10,000 square feet for the system and two replacements | Verified | [County Health Department well and septic FAQ](https://health.frederickcountymd.gov/m/faq?cat=28#question-138) |
| Frederick Valley limestone is one of Maryland's main collapse-sinkhole areas | Verified | [Maryland Geological Survey](https://www.mgs.md.gov/geology/geohazards/engineering_problems_in_karst.html) |
| A subcontractor must give the owner notice within 120 days of its work, and a lien must be filed within 180 days of completion | Verified | [Maryland Real Property 9-104](https://law.justia.com/codes/maryland/real-property/title-9/subtitle-1/section-9-104/) |
| Whether the county requires a geotechnical report for a house in a mapped carbonate area | Open | Ask the county |
| Whether the county still accepts remote video inspections | Open | Ask the county |
| Whether new one- and two-family homes must have automatic sprinklers | Open | Ask the county |
| Blower door and duct leakage limits under the Maryland-amended IECC | Open | Ask the county |
| Permit fees, impact fees and any wet-season window for perc testing | Open | Ask the county |

## People who sign off and bottlenecks

Sixteen decision points stand between a brief and a certificate of occupancy, and the system prepares evidence for each one without making the decision. The first build covers the rows through plan review.

| Step | Who decides | What the system hands them | Usual bottleneck |
| --- | --- | --- | --- |
| Program and budget | Owner | Approved design specification and Uniformat II estimate | Scope growth |
| Loan approval | Loan officer and underwriter | Plans, MasterFormat specification, cost breakdown | Lender approval of the builder |
| Appraisal on plans | State-licensed appraiser | Plans, specification, cost breakdown | Comparable sales for a custom house |
| Zoning and subdivision | County zoning administrator, Planning Commission or staff | Site plan with setbacks | Replatting, school capacity and forest review |
| Perc test, well and septic | County Health Department sanitarian, licensed septic installer, well driller | Staked site and pit locations | Test scheduling and season |
| Geotechnical report | Geotechnical engineer | Boring plan | Drill rig scheduling in karst areas |
| Grading and stormwater | County stormwater engineering | Grading and stormwater plan | Resubmittals |
| Design of record | Registered builder-designer, or a Maryland architect or engineer where required | Permit drawings and calculations | Engineering of anything beyond the IRC tables |
| Plan review | County building, zoning, health and life-safety reviewers | Permit set and submission completeness report | Review cycles |
| Trade permits | Maryland master electrician, plumber, gas fitter, HVACR contractor | Trade drawings | Trade availability |
| Stage inspections | County inspectors | Readiness evidence per stage | Failed re-inspections |
| Construction draws | Lender draw inspector | Percent complete with hashed, geotagged photos and scans, plus lien releases | Draw turnaround |
| Energy tests | Energy rater or approved tester | Blower door and duct test setup | Rater scheduling |
| Certificate of occupancy | County building official | All finals, including septic and driveway apron | The last failed final |
| Loan conversion | Lender | Completion appraisal update, lien waivers, occupancy certificate | Missing waivers |
| Handover | Owner | COBie dataset and as-built model | Punch list |

## Build phases and what each one shows

The build runs in six phases, and each ends at a gate that must pass before the next starts. Phase 0 comes first because the papers' model rankings are already out of date.

&#91;embedded content: build phases · 6 phases, 6 gates, then later work\]

Kim sees the first visible result at the end of Phase 1, when a typed brief becomes an approved specification and a layout she can drag. The last gate is the only one a person must pass, and it decides whether the proof of principle holds.

## Evaluation and acceptance tests

Every claim the proof of principle makes is backed by a test that runs without a person and a sample that a person checks. The false-pass rate on code rules is the number that decides whether it works.

| Test | Pass condition | What it proves |
| --- | --- | --- |
| BIM-Edit, 324 tasks, raw code tool versus our typed tools, current models | Typed tools solve more tasks at the 98% threshold | The tool layer does the work, measured against a public benchmark |
| IFC-Bench fixed 514-question test split | Accuracy reported with partial answers counted wrong | Read tools answer questions about the model |
| Spec assertions | Every assertion holds after every change | The model matches what the owner approved |
| IDS and schema checks with IfcTester | Zero failures | The model carries the data the permit set needs |
| Code rules on held-out boundary models generated by our tools | No false passes, with false fails tracked, across several seeds | Rules catch violations at the code limits |
| Layout solver after random drags | Every constraint holds, or the solver names the constraint that blocks the move | Drag-and-drop never leaves an invalid plan |
| Layout realism against ResPlan room-size and adjacency statistics | Reported, not gated | Solver layouts resemble real homes |
| Engine input rebuild | Inputs regenerated from the same model hash are identical | Energy, moisture and cost results trace to one model |
| Licensed reviewer sample | Reviewer agrees with each sampled verdict, and every disagreement is logged | The checks match how a person applies the code |
| Run cost and time | Reported per phase | The pipeline is affordable to repeat |

## Claude Code build prompt

Paste the block below into Claude Code as the first message, with this document saved in the repository as docs/PLAN.md. It covers Phases 0 to 2 and the near-term release in detail and Phases 3 to 5 in outline, because later tasks depend on gate results.

```text
You are building a proof of principle for AI-assisted residential design in Frederick County, Maryland. Read docs/PLAN.md before you start. Work one phase at a time. At each gate, write docs/gates/phase-N.md with the numbers, the failures and the open items, then stop and wait for approval.

GOAL
The first release is a design and pre-construction tool for one detached two-story wood-frame house of about 2,000 square feet. It takes a plain-language brief to an IFC 4.3 model with priced products, renders, a cost estimate, an energy estimate and an advisory code pre-check, exported as a handoff package for a builder or architect. It stops one step short of the permit set and claims nothing about passing inspection. Every part is built so the later permit-grade version reuses it unchanged.

RULES
1. Only typed tools write to the IFC model. Never write the model with free code. If an operation has no tool, stop and propose a new typed tool with its preconditions, the IFC relationships it creates and its tests.
2. Every write tool creates its relationships in the same call. That means storey containment (IfcRelContainedInSpatialStructure), openings (IfcRelVoidsElement), fillings (IfcRelFillsElement), wall joins (IfcRelConnectsPathElements), space boundaries (IfcRelSpaceBoundary) and aggregation. Each tool returns a structured diff.
3. Areas, counts, quantities and takeoffs are pure functions with unit tests. Never compute them in model reasoning.
4. Free Python runs read-only in a sandbox with a tool-call budget and a stop condition.
5. The control loop is plain Python that runs planner, generator and evaluator in a fixed order. No agent decides the call order.
6. Google OR-Tools CP-SAT places rooms. The language model produces only the room program and preferences.
7. Each code rule has a plain-English interpretation citing section, edition and local amendment, a Python checker, labelled pass and fail IFC test models, and one verdict per element from PASS, FAIL, ALERT, MANUAL_CHECK and NA. Never take rule values from memory or from papers. Draft each interpretation for a person to verify against the adopted code text, and mark it unverified until they do.
8. Keep two check sets. The repair loop sees only the repair set. The acceptance set is held out from every agent that edits the model.
9. Never delete a wall, slab, beam, column, footing or roof element to clear a check. Deleting a structural element needs human approval recorded in the ledger.
10. Never read dimensions from an image for a code check. Images inform style only.
11. Hash every model state. The ledger records the change, the tool call, each check and its result, and the reviewer.
12. Never state that anything is compliant, approved or permitted. Report verdicts and leave approval to people. Every verdict shown to a user carries the label advisory, manual-check items stay visible, and the word compliant never appears in the interface.
13. Log every brief, specification draft, owner answer, room drag, product choice and advisory verdict with a timestamp and the model hash. This log is the dataset for the permit-grade version.

STACK
Python 3.13, IfcOpenShell 0.8, Bonsai for viewing, IfcTester for IDS, Google OR-Tools, OpenStudio SDK with EnergyPlus, Ladybug Tools with Radiance, Blender for Cycles renders, pytest, and the Python MCP SDK for the tool server. Open-weights model runs go on the RunPod GPU box. WUFI Pro, RSMeans and ICC code licensing are open items. Until a license exists, the affected check returns MANUAL_CHECK.

REPOSITORY
spec/ design specification JSON Schema and examples
solver/ layout solver
tools/ typed MCP tool server
model/ IFC helpers and quantity functions
rules/ one folder per rule with interpretation.md, checker.py, tests/ and verdict labels
checks/ IDS files, repair set, acceptance set
engines/ energy, moisture, framing tables, daylight and takeoff adapters
ledger/ hashing and change log
bench/ BIM-Edit and IFC-Bench harnesses
docs/ plan, decision log, open items, gate reports

PHASE 0. BENCHMARK HARNESS
- Clone BIM-Edit (arxiv.org/abs/2606.20146, repository linked in the paper) and IFC-Bench (huggingface.co/datasets/sylvainHellin/ifc-bench).
- Reproduce the BIM-Edit raw-code baseline with one current Claude model and one open-weights model on RunPod. Use the paper's harness unchanged, including the 20-call budget.
- Run the IFC-Bench fixed 514-question test split with the same two models and score partial answers as wrong.
- Report scores, cost and time per task.
Gate: scores fall in a range consistent with the papers, or the gap is explained.

PHASE 1. BRIEF, SPECIFICATION AND LAYOUT
- Write the design specification JSON Schema. It holds the lot polygon, setbacks and north direction, the room program (type, storey, minimum area, minimum width, adjacency wants, daylight wants), the style (named style, named paint colors from one manufacturer's color system, materials as MasterFormat section plus product class) and hard constraints. Every item has an id and a measurable test.
- Build the specification step. Claude turns a brief and reference images into a draft specification and a list of questions. Geometry does not start until the owner answers them.
- Build the solver. Rooms are rectangles on a grid per storey. Constraints are no overlap, inside the buildable footprint, minimum dimensions from verified rule files, required adjacencies, stairs aligned across storeys, and bedrooms on an exterior wall. Preferences are stacked wet walls and daylight direction. When the user drags a room, pin it and minimize movement of the others. Return, for each moved room, the constraint that moved it. If no layout exists, name the blocking constraint.
- Build a minimal plan view in the browser that calls the solver on drag.
Gate: every spec assertion holds after every drag in a randomized test of at least several hundred drags.

PHASE 2. IFC 4.3 MODEL
- Build typed tools for storeys, walls, wall joins, slabs, doors and windows hosted in walls, spaces from boundaries, material layer sets, stairs, parametric gable and hip roofs, bSDD properties, and Uniformat II, MasterFormat and OmniClass classification.
- Each tool has tests that open the result in IfcOpenShell, validate the schema, run IDS checks and assert every relationship listed in rule 2.
- Convert the Phase 1 layout into an IFC model with these tools only.
- Re-run BIM-Edit with our typed tools in place of the raw code tool.
Gate: zero schema or IDS failures, and typed tools solve more BIM-Edit tasks than the raw code baseline.

NEAR-TERM RELEASE, BUILT AFTER THE PHASE 2 GATE AND ALONGSIDE PHASE 3
- Style from words or reference images resolves into real products with prices: named paint colors from one manufacturer, specific flooring SKUs, a window series. Each product carries its MasterFormat section, SKU and listing reference.
- Blender Cycles renders use the lot's sun path through the seasons from the same EPW weather file EnergyPlus uses.
- A live budget in Uniformat II line items updates on every change, from the fixed quantity functions.
- An EnergyPlus annual estimate runs from inputs rebuilt from the model hash.
- Each Phase 3 rule joins the advisory pre-check, with its citation, once it passes its own tests.
- Export writes the IFC 4.3 model, the specification, the product schedule and PDF sheets.
Gate: a first-time user goes from brief to exported package without help, and every number in the package traces to the model hash.

PHASES 3 TO 5, OUTLINE
Phase 3 writes 15 to 25 IRC 2021 rules from verified interpretations, runs them in advisory mode in the near-term release, generates labelled boundary test models with our own tools, and reports the false-pass rate on the held-out set. Candidate topics are emergency escape openings, habitable room size, ceiling height, stair geometry, guards, handrails, smoke and CO alarm locations, fixture clearances, radon vent routing under the county amendment, and prescriptive header spans.
Phase 4 generates EnergyPlus inputs, a WUFI Pro run for the chosen wall and a takeoff coded to Uniformat II and MasterFormat, all rebuilt from the model hash.
Phase 5 belongs to the permit-grade version and produces the county submission completeness report and the licensed reviewer sample.

STOP AND ASK
Stop and ask before any purchase or license, before spending more than the RunPod budget in docs/PLAN.md, when a code value is not yet verified, and when a task would require deleting a structural element.
```

The RunPod spending cap is not set yet and is listed under open items.

## Open items

Three items block Phase 0: the RunPod cap, the lot choice and access to the adopted code text. The rest block later phases.

- [ ] Set the RunPod spending cap for benchmark runs
- [ ] Choose the lot, either the hypothetical unincorporated parcel or a real Frederick County parcel
- [ ] Get access to the adopted code text for verifying rule interpretations, through ICC Digital Codes or the county
- [ ] Download and review the ECPPM 2026 paper by Du, Hellin, Fuchs and Borrmann from Zenodo
- [ ] Confirm whether ARCHER picked its best checkpoints on training data or test data, from the paper's code or the authors
- [ ] Confirm the 2024 code adoption date and the county effective date
- [ ] Ask the county whether a geotechnical report is required in mapped carbonate areas
- [ ] Ask the county whether remote video inspections are still accepted
- [ ] Ask the county whether new one- and two-family homes must have sprinklers
- [ ] Ask the county for blower door and duct leakage limits, permit and impact fees, and any perc test season
- [ ] Confirm whether an owner who is not a registered builder may submit self-prepared drawings
- [ ] Price licenses for WUFI Pro and RSMeans data
- [ ] Check whether UpCodes offers a developer API
- [ ] Find a licensed reviewer for the Phase 5 sample, either a Maryland architect, a Maryland engineer or an experienced plan reviewer
- [ ] Confirm which countries the ResPlan listings come from before using it as a realism reference

* [ ] Choose product and price data sources for the catalog, including one paint manufacturer's color data, and check their terms of use
* [ ] Line up one builder or architect willing to receive the handoff package and compare the advisory verdicts with their own review

## Sources

Papers reviewed in full from the supplied files:

- Nithyanantham, Kujat, Sesterhenn, Telgmann, Nedungadi, Plönnigs, Bartelt, Lüdtke. [BIM-Edit: Benchmarking Large Language Models for IFC-Based Building Information Modeling](https://arxiv.org/abs/2606.20146). arXiv, June 2026.
- Nithyanantham, Sesterhenn, Nedungadi, Peral Garijo, Zenkner, Bartelt, Lüdtke. [MCP4IFC: IFC-Based Building Design Using Large Language Models](https://arxiv.org/abs/2511.05533). arXiv, November 2025.
- Anand, Tan, Teo, Tan. [ARCHER: Agentic Rule and Compliance Harness for Executable Regulations](https://arxiv.org/abs/2607.25566). arXiv, July 2026.
- Du, Esser, Nousias, Borrmann. [Text2BIM: Generating Building Models Using a Large Language Model-based Multi-Agent Framework](https://arxiv.org/abs/2408.08054). Journal of Computing in Civil Engineering 40(2), 2026.
- Deng, Du, Nousias, Borrmann. [BIMgent: Towards Autonomous Building Modeling via Computer-use Agents](https://arxiv.org/abs/2506.07217). arXiv, 2025.
- Zheng, Dong, Li, Jing, Han, Shen, Song, Yang. [ReliCAD: From Uncertain LLM Generation to Reliable Parametric CAD Modeling](https://arxiv.org/abs/2609.22325). arXiv, September 2026.
- Wang, Meng, Xiang, Liu, Zhou, Chen, Tang. [Text2CAD-Bench: A Benchmark for LLM-based Text-to-Parametric CAD Generation](https://arxiv.org/abs/2605.18430). arXiv, May 2026.
- Rukhovich, Dupont, Mallis, Cherenkova, Kacem, Aouada. [CAD-Recode: Reverse Engineering CAD Code from Point Clouds](https://arxiv.org/abs/2412.14042). ICCV 2025.
- Shabani, Hosseini, Furukawa. [HouseDiffusion: Vector Floorplan Generation via a Diffusion Model with Discrete and Continuous Denoising](https://arxiv.org/abs/2211.13287). CVPR 2023.
- Madireddy, Gao, Din, Kim, Senouci, Zhang, Han. [Large Language Model-Driven Code Compliance Checking in Building Information Modeling](https://arxiv.org/abs/2506.20551). arXiv, June 2025.
- Gautam, Acharya, Kleeman, Foster. [Towards an automated AI-based framework for floor plan compliance checks for residential buildings](https://arxiv.org/abs/2607.00015). arXiv, 2026.
- You, Chen, Xue. [Automated Scan-to-BIM for Construction Digital Transformation](https://frankxue.com/pdf/you26automated.pdf). Automation in Construction 182, 106755, 2026.
- City of Seattle Innovation and Performance and Seattle Department of Construction and Inspections. [CivCheck AI Pre-Screening Pilot Report](https://www.seattle.gov/documents/Departments/Performance/Publications/2026CivCheckEvaluationReport.pdf). 2026.

Newer work found during the review:

- Lara and seven co-authors. [Generative Floor Plan Design with LLMs via Reinforcement Learning with Verifiable Rewards](https://arxiv.org/abs/2605.14117). arXiv, May 2026.
- Abouagour, Garyfallidis. [ResPlan: A Large-Scale Vector-Graph Dataset of 17,000 Residential Floor Plans](https://arxiv.org/abs/2508.14006). arXiv, August 2025.
- Hellin, Jang, Fuchs, Nousias, Borrmann. [Agentic Search for BIM Information Extraction: Systematic Evaluation](https://doi.org/10.1016/j.autcon.2026.107260). Automation in Construction 192, 107260, 2026. Dataset on [Hugging Face](https://huggingface.co/datasets/sylvainHellin/ifc-bench).
- Gao, Hu, Chai, Weng, Li. [Multi-agent framework for schema-guided reasoning and tool-augmented interaction with IFC models](https://www.sciencedirect.com/science/article/pii/S0926580526001299). Automation in Construction 186, 106888, 2026.

Frederick County and Maryland facts come from the linked pages in the code and permit section, gathered in the research report of September 28, 2026.
