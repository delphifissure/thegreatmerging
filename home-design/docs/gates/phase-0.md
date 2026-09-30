# Phase 0 gate: benchmark harness

Date: 2026-09-30. Branch `claude/lucid-bell-915f1e`, folder `home-design/`.

## Gate verdict

The build prompt's gate is "scores fall in a range consistent with the papers, or the gap is
explained." The recommendation is to **pass with conditions**:

- **BIM-Edit, the paper's own numbers: reproduced.** From the authors' published runs we get
  their headline figures exactly: best mean score 49.48%, best strict solve rate 3.4%, and
  Claude Sonnet 4.6 hitting the 20-call cap on 45.7% of tasks.
- **BIM-Edit, our Claude run: not a like-for-like reproduction, and the gap is explained.** The
  authors' harness and evaluator are not public. Claude ran through Claude Code on the plan, as
  Dane decided, and was scored with a scorer rebuilt from the paper. Calibration shows how far
  that scorer sits from theirs.
- **IFC-Bench: run on the fixed 514-question split with partial answers counted wrong.** It is
  not yet compared with the IFC-Bench paper, whose protocol has not been read (arXiv 2605.01698;
  arxiv.org is still blocked in this session).

Before Phase 1: Dane approves or rejects this gate. The open items at the end list what would
make it a clean pass.

## What ran

| Run | Model | Where | Harness |
| --- | --- | --- | --- |
| IFC-Bench | Gemma 4 31B IT (open weights) | vLLM on one RunPod RTX PRO 6000 | Our read agent: one read-only code tool, 20-call budget, one final turn after the budget |
| IFC-Bench | Claude Sonnet 5.5 | Claude plan, headless Claude Code | Same system prompt and tool, served over MCP. Claude Code's own prompt and tools are off |
| IFC-Bench judge | Claude Opus 5.5, effort medium | Claude plan, headless Claude Code | Labels correct, partial or incorrect. Partial counts as wrong |
| BIM-Edit subset | Claude Sonnet 5.5 | Claude plan, headless Claude Code | Paper's system prompt, tool description, namespace, 20-call budget and 420 s tool timeout |
| BIM-Edit reference | 7 models from the paper | Authors' published runs | Authors' harness, re-read from their files |

One sample per question or task, as in both papers. Model versions and prompt hashes are in
each run's manifest (`bench/*/results/manifest_*.json`).

## IFC-Bench, fixed 514-question test split

Accuracy with partial answers counted wrong, and 95% Wilson intervals.

| | Gemma 4 31B | Claude Sonnet 5.5 |
| --- | --- | --- |
| All (n = 514) | **31.3%** (161/514; 27.5–35.5) | **53.3%** (274/514; 49.0–57.6) |
| 1. Direct lookup (72) | 29.2% | 62.5% |
| 2. Counting and aggregation (289) | 26.7% | 48.8% |
| 3. Geometry and space (50) | 16.0% | 52.0% |
| 4. Information not in the model (103) | 53.4% | 60.2% |
| Partial counted as correct | 71.3% | 89.7% |
| Labels: correct / partial / incorrect | 161 / 205 / 147 | 274 / 187 / 53 |
| Mean time per question | 108 s | 20 s |
| Mean tool calls | 5.5 | 3.0 |
| Mean input tokens | 25,400 | 20,500 |
| Hit the 20-call budget | 10 | 0 |

Gemma's 31.3% counts one question that never got an answer (a RunPod proxy timeout) as wrong.

Reading of the numbers:

- **Partial answers dominate the misses.** Sonnet 5.5 gets part of the answer right on 187
  questions it does not get fully right, mostly counting and aggregation. This is the failure
  the plan's rule 2 targets: areas, counts and quantities come from fixed functions, not from
  model reasoning.
- **The judge is strict.** Some reference answers include facts the question did not ask for,
  such as a floor count in "what type of building is this". Answers that leave those out are
  marked partial. The partial-as-correct row shows the lenient reading.
- **This is not the IFC-Bench paper's protocol.** Our agent, prompt and judge are our own. The
  numbers compare the two models here with each other, not with the paper.

Per-question answers and judge labels: `bench/ifc_bench/results/{gemma4-31b,cc-sonnet55}.jsonl`.

## BIM-Edit

### The paper's numbers, from the authors' published runs

Source: `huggingface.co/datasets/BIM-Edit/BIM-Edit-runs`. These are the authors' own
evaluations, summarized without rescoring (`bench/bim_edit/results/published_runs.json`).

| Model | Mean score | Strict solve rate | Hit 20-call cap | API cost, 324 tasks | Mean time per task |
| --- | --- | --- | --- | --- | --- |
| Gemini 3.0 Flash | **0.4948** | 1.5% | 12.0% | $8.13 | 94 s |
| Qwen 3.6 Plus | 0.4778 | **3.4%** | 16.7% | (OpenRouter) | 826 s |
| Claude Sonnet 4.6 | 0.4531 | 1.9% | **45.7%** | $197.94 | 247 s |
| GPT-5.4 | 0.4394 | 1.2% | 0.0% | $26.81 | 91 s |
| DeepSeek V3.2 | 0.4321 | 2.2% | 0.3% | (OpenRouter) | 456 s |
| GPT-5.4 Mini | 0.3979 | 0.6% | 0.0% | $2.12 | 30 s |
| Gemma 4 31B | 0.3754 | 0.9% | 7.4% | (OpenRouter) | 690 s |

"Strict solve" means geometry, semantics and topology are each at least 0.98 (paper, Table 2).

### The authors' evaluator is not public, so it was rebuilt

The paper (v3, June 23 2026) links only the dataset. It says the MIT-licensed harness and
evaluator were "included with the submission", but there is no public repository. The scorer
in `bench/bim_edit/evaluator/` is rebuilt from section 3.2 and appendix E. It was checked
against the authors' per-task evaluations of 648 edited models: 4 models × 162
artificial-scene tasks, the only runs whose edited files are small enough to download in bulk.

Comparing it with those evaluations showed that the released evaluator does not always do
what the paper says. Found by reading their published per-task records:

| Where | Paper says | Released evaluator does | Effect |
| --- | --- | --- | --- |
| Delete tasks, semantics | 1 if the target was removed, else 0 | Compares the target with whatever still has its ID in the edited model: **a correct delete scores 0, a skipped delete scores 1** (532 vs 191 cases across 7 models) | Rewards not deleting. Inflates semantics for models that fail deletes and deflates it for models that succeed |
| Topology | λ·F1(nodes) + (1−λ)·F1(edges), λ = 0.3 | Mean of seven rule values (node and edge precision, recall and F1, and the λ score). Holds for all 2,267 published records | Precision and recall count twice as much as in the formula |
| Topology scope | Whole edit graph | Per matched pair, limited to changes touching that entity. An unmatched entity scores 0 | Local rather than global |
| Geometry | Pooled median Chamfer over the edit set | Median of per-pair scores, with an unmatched reference scoring 0. The pooled value is kept only as a side metric | Stricter: a close but unmatched object scores 0 |
| Topology rules on 125 artificial tasks | Default rules | Task-specific rules (`has_opening`, `fills_voids`, `opening_voids`, `spatial_contained`) from the non-public task metadata | Not reproducible without that metadata |
| "Fully solves more than 3.4%" | Solved = all three metrics ≥ 0.98 | Matches (Qwen 3.6 Plus: 3.4%) | None |

The scorer has two modes. `released` mirrors the published behaviour, including the delete
bug, so our numbers compare with theirs. `paper` follows the text, with the bug fixed.

**Calibration** (`bench/bim_edit/results/calibration.json`), released mode against the
authors' scores:

| | Tasks with default topology rules (148) | All 648 |
| --- | --- | --- |
| Final score within 0.01 | 77% | 53% |
| Final score within 0.05 | 79% | 59% |
| Topology within 0.01 | 88% | 59% |
| Node F1 / edge F1 within 0.01 | 90% / 93% | 67% / 66% |
| Semantics within 0.01 | 89% | 85% |
| Geometry within 0.01 | 78% | 75% |

Residual gaps have three causes. Geometry details are not documented: for example, displaced
objects sometimes still match at overlap 1.0 in the published runs. Sampling noise moves
geometry scores by about 0.0003. And the custom topology rules on 125 artificial tasks can't
be reproduced. All 162 realistic-scene tasks use the default rules.

On the 9 realistic tasks in the subset, this scorer rates the two published models **0.10–0.13
higher** than the authors' own scores. The realistic scenes were not in the bulk calibration,
so treat absolute numbers there as optimistic by about that much.

### Claude Sonnet 5.5 on an 18-task stratified subset

One task per operation × instruction category × scene cell (18 cells). Element types rotate so
each of column, door, room, slab, wall and window appears 3 times. All three runs are scored by
the same rebuilt scorer on the same 18 tasks (`bench/bim_edit/results/scores_cell1.json`).

| Run | Final, released mode | Final, paper mode | Strict solves (released / paper) | Authors' own score |
| --- | --- | --- | --- | --- |
| **Claude Sonnet 5.5, Claude Code on the plan** | **0.696** | **0.823** | 2 / 6 | n/a |
| GPT-5.4, authors' run | 0.461 | 0.557 | 0 / 1 | 0.395 |
| Claude Sonnet 4.6, authors' run | 0.367 | 0.485 | 1 / 3 | 0.331 |

By scene, released mode: Sonnet 5.5 scores 0.589 on artificial and 0.803 on realistic tasks,
GPT-5.4 0.464 / 0.458, and Sonnet 4.6 0.311 / 0.423.

Sonnet 5.5 used 5.1 tool calls, 27 s and 43,500 input tokens per task on average; none hit the
budget, and all 18 edited models were saved. The authors' Sonnet 4.6 used 16.5 calls, 247 s and
160,000 tokens.

How much weight this carries:

- n = 18, one sample each. It is a direction, not a ranking.
- The Claude run used Claude Code's agent loop, not the authors' LangGraph agent. Their
  Sonnet 4.6 lost 128 of 324 tasks to that loop's call limit. Part of the gap is the harness,
  which is the build plan's own point ("the typed tool layer does most of the work").
- The lead over GPT-5.4 (+0.24 released) is larger than the scorer's known optimism on
  realistic scenes (+0.10 to +0.13).

The Phase 2 gate reruns BIM-Edit with our typed tools. This subset is the baseline that run
has to beat.

## Cost and time

| Item | Spend |
| --- | --- |
| RunPod, Gemma 4 31B (two pods, RTX PRO 6000 at $2.09/h, 3.9 h total) | **$8.18** of the $50 cap |
| Claude runs and judge | Billed to the Claude plan. List-price equivalent reported by Claude Code: IFC-Bench Sonnet 5.5 $21.04, BIM-Edit subset $1.12, judge not totalled (1,027 short calls) |

$2.72 of the RunPod spend was wasted: the first pod lost its run to a container restart, and
the watcher I wrote to shut it down had a process-ID bug. Both are fixed (`run_on_pod.sh`
ties the shutdown to the run's own process, and resumed runs retry failed questions).

## Failures and incidents

- **Two container restarts** killed running jobs. Every runner resumes where it stopped, so
  nothing was lost. The first restart also turned 489 Gemma questions into connection
  errors, which were retried.
- **The BIM-Edit subset was rerun twice.** The first run used a tool description that did not
  match the paper's appendix F.4. The first subset selection also picked column tasks in every
  cell. Both were fixed before the numbers above.
- **Large edited models were lost on shutdown.** Claude Code stopped the tool server while a
  350 MB model was still being written. The edit worker now saves on its own and the runner
  checks the file ends cleanly.
- **TLS:** Python 3.13 rejects the session proxy's CA under strict checks. Relaxing the check
  was refused by the session's safety policy, so HTTPS through the proxy goes via curl.

## Decisions made (see docs/decisions.md)

- Project lives in `home-design/` in this repository.
- $50 cap for RunPod; Claude runs go through the Claude plan, no API key.
- Gemma 4 31B is the open-weights model (the same one the BIM-Edit paper ran).
- BIM-Edit tasks and pinned targets rebuilt from the authors' published runs.
- BIM-Edit scorer rebuilt from the paper with a released and a paper mode.

## Open items

Needed for a clean Phase 0 pass:

- [ ] Read the IFC-Bench paper's evaluation protocol and headline numbers (arXiv 2605.01698;
      arxiv.org is still blocked in this session). Then either align our judge or report both.
- [ ] Ask the BIM-Edit authors for the release package (harness, evaluator, `tasks.jsonl` with
      topology rubrics). The first author is Bharathi Kannan Nithyanantham, University of
      Rostock. With it, the rebuilt scorer is replaced and calibration is exact. Also tell them
      about the delete-task semantics bug.
- [ ] Decide whether to run Sonnet 5.5 on all 324 BIM-Edit tasks, or at least all 162
      artificial ones (small files, about 30 s each), for a number with a usable confidence
      interval. This costs plan usage only.
- [ ] Decide whether to run a second Claude model (Opus 5.5 or Haiku 4.5), per design rule 12.

Carried from the plan, not blocking Phase 1: lot choice, adopted code text access, county
questions, licences (see `docs/open-items.md`).

## Reproduce

```bash
cd home-design
.venv/bin/python -m bench.bim_edit.published                 # paper's numbers from published runs
.venv/bin/python -m bench.bim_edit.evaluator.calibrate       # needs data/bim_edit downloads
.venv/bin/python -m bench.bim_edit.score_runs --ours cc-sonnet55-cell1 --published gpt-5.4 claude-sonnet
bench/claude_code/phase0.sh                                  # Claude runs and judge (resumable)
bench/ifc_bench/run_on_pod.sh hd-gemma4 gemma4-31b 3         # after: python -m bench.common.runpod up --name hd-gemma4
.venv/bin/python -m bench.ifc_bench.score --run-id cc-sonnet55 --judge-model cc-claude-opus-5-5
```
