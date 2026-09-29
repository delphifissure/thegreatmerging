# Decision log

Newest first. Each entry says what was decided, by whom, and why.

## 2026-09-29

- **Claude runs use the Claude plan through headless Claude Code, not the API.** Dane's call:
  no API key and no API bill. Consequences:
  - BIM-Edit on Claude is run with the paper's system prompt, tool, 20-call budget and 420 s
    tool timeout, but inside Claude Code's agent loop rather than the authors' LangGraph agent.
    It is reported as "Claude Code harness" and is not a like-for-like reproduction of the
    paper's Claude number. The open-weights comparison (Gemma 4 31B) is unaffected.
  - The plan's usage limits, not dollars, bound the run. Runners pause when the limit is hit
    and resume later. The notional list-price cost Claude Code reports is recorded for
    reference and is not counted against the $50 cap, which now covers RunPod only.
  - The IFC-Bench judge also runs through Claude Code, with `--json-schema` for the label.

- **Project lives in `home-design/` inside the thegreatmerging repository.** Dane chose this
  over a new repository. The folder shares nothing with The Plan app and can be split out
  with `git subtree split --prefix home-design`.
- **Phase 0 spending cap is $50** for Anthropic API calls and RunPod GPU time together.
  Set by Dane. Enforced by `bench/common/budget.py` against `bench/spend.jsonl`.
- **Open-weights model is Gemma 4 31B IT** (`google/gemma-4-31B-it`), served with vLLM on a
  single RunPod GPU. It is the open-weights model the BIM-Edit paper ran, so our number can be
  compared with theirs directly. Gemma 4 is not gated on Hugging Face.
- **BIM-Edit tasks were rebuilt from the authors' published run cache** because the harness
  repository is linked only from the arXiv paper, and arXiv is blocked by this environment's
  network policy. All 324 tasks and every file they name are in the published Hugging Face
  datasets. The rebuilt `bench/bim_edit/tasks.jsonl` must be checked against the official
  `data/tasks.jsonl` once the repository is reachable.
- **BIM-Edit baselines are not re-run with a re-implemented evaluator.** The build prompt says
  to use the paper's harness unchanged. Its scorer (OBB matching, pooled median chamfer,
  property checks and a topology delta graph, per the published `config.json`) is not public
  outside the repository, and a re-implementation would not be "unchanged". We wait for the
  repository link.
- **IFC-Bench is run with our own read agent and a strict judge.** The IFC-Bench paper's agent
  code is not in the dataset repository. Our agent has one read-only code tool, a 20-call
  budget and a stop condition (after the budget is spent the model gets one turn to answer
  without tools). A Claude judge labels each answer correct, partial or incorrect; partial
  counts as wrong. We also report partial-as-correct so the gap is visible.
- **HTTP calls through the session proxy use curl.** Python 3.13 rejects the proxy's CA
  under its strict X.509 checks. Relaxing that check was refused by the session's safety
  policy, so HTTPS to Hugging Face and to the RunPod endpoint goes through curl, which trusts
  the configured CA bundle. The Anthropic API is reached directly and is unaffected.
