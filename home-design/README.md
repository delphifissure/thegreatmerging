# Home design proof of principle

A separate project that lives in this repository for now. It has nothing to do with
The Plan app around it and shares no code with it. It can move to its own repository
later with `git subtree split --prefix home-design`.

- Plan and build prompt: [docs/PLAN.md](docs/PLAN.md)
- Gate reports: [docs/gates/](docs/gates/)
- Decisions: [docs/decisions.md](docs/decisions.md)
- Open items: [docs/open-items.md](docs/open-items.md)

## Setup

```bash
cd home-design
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -e '.[dev]'
.venv/bin/pytest
```

## Layout

| Folder | Contents | Status |
| --- | --- | --- |
| `bench/` | BIM-Edit and IFC-Bench harnesses, shared LLM clients, spend ledger | Phase 0 |
| `spec/` | Design specification JSON Schema and examples | Phase 1 |
| `solver/` | CP-SAT layout solver | Phase 1 |
| `tools/` | Typed MCP tool server, the only writer of the IFC model | Phase 2 |
| `model/` | IFC helpers and quantity functions | Phase 2 |
| `rules/` | One folder per code rule | Phase 3 |
| `checks/` | IDS files, repair set, acceptance set | Phase 2 and 3 |
| `engines/` | Energy, moisture, framing, daylight and takeoff adapters | Phase 4 |
| `ledger/` | Hashing and change log | Phase 1 onward |

## Claude runs go through Claude Code, not the API

Dane's decision (2026-09-29): Claude benchmark runs use the Claude plan through headless
Claude Code (`claude -p`), so there is no API bill. Each task is one isolated `claude -p`
call: our system prompt replaces Claude Code's, the built-in tools are switched off, and the
only tool is `execute_ifc_code` from our MCP server (`bench/claude_code/ifc_tool_server.py`).
Runs pause and retry when the plan's usage limit is hit, and resume where they stopped.

```bash
# IFC-Bench, fixed 514-question split
.venv/bin/python -m bench.claude_code.run_ifc_bench --model claude-sonnet-5-5 --run-id cc-sonnet55
# BIM-Edit, all 324 tasks (or --per-cell 1 for an 18-task stratified subset)
.venv/bin/python -m bench.claude_code.run_bim_edit --model claude-sonnet-5-5 --run-id cc-sonnet55
# Judge any IFC-Bench run, then score it (partial answers count as wrong)
.venv/bin/python -m bench.claude_code.judge --run-id gemma4-31b --judge-model claude-opus-5-5
.venv/bin/python -m bench.ifc_bench.score --run-id gemma4-31b --judge-model cc-claude-opus-5-5
```

The API code paths (`bench/common/llm.py` AnthropicChat, `bench/ifc_bench/judge.py`) stay for
later use but are not used for Phase 0.

## Spending

Every paid call (RunPod GPU time; the Anthropic API if it is ever used) is written to `bench/spend.jsonl`
through `bench/common/budget.py`, which refuses to start work once the recorded
total would pass the cap in `bench/budget.json` (currently $50, set by Dane on
2026-09-29).
