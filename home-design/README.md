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

## Spending

Every paid call (Anthropic API, RunPod GPU time) is written to `bench/spend.jsonl`
through `bench/common/budget.py`, which refuses to start work once the recorded
total would pass the cap in `bench/budget.json` (currently $50, set by Dane on
2026-09-29).
