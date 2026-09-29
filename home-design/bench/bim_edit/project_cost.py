"""Project what a Claude BIM-Edit run would cost, from the tokens the paper's runs used.

The paper's harness sends the whole history each turn without prompt caching, so the
published input and output token totals price directly. A run on a current model is
assumed to use the same tokens per task as the Claude Sonnet 4.6 run; that is an
assumption, and the first tasks of a real run should replace it.

    python -m bench.bim_edit.project_cost
"""

from __future__ import annotations

import csv
import json

from bench.common.budget import ANTHROPIC_PRICES

from .published import DATA_DIR


def main() -> None:
    rows = list(csv.DictReader((DATA_DIR / "claude-sonnet" / "per_task.csv").open(newline="")))
    tin = sum(float(r["input_tokens"] or 0) for r in rows)
    tout = sum(float(r["output_tokens"] or 0) for r in rows)
    print(f"Sonnet 4.6 run: {len(rows)} tasks, {tin/1e6:.1f}M input, {tout/1e6:.2f}M output tokens")
    out = {}
    for model, (p_in, p_out, _cw, _cr) in ANTHROPIC_PRICES.items():
        full = (tin * p_in + tout * p_out) / 1e6
        out[model] = {"full_324": round(full, 2), "per_task": round(full / len(rows), 3),
                      "tasks_for_25_usd": int(25 / (full / len(rows)))}
        print(f"{model:20s} full run ${full:7.2f}   per task ${full/len(rows):.3f}   "
              f"tasks within $25: {out[model]['tasks_for_25_usd']}")
    print(json.dumps(out))


if __name__ == "__main__":
    main()
