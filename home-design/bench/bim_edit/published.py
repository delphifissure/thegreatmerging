"""Re-derive the BIM-Edit paper's headline numbers from the authors' published runs.

Source: huggingface.co/datasets/BIM-Edit/BIM-Edit-runs (CC BY 4.0), one folder per
model with the harness config, the per-task evaluation and a summary.

    python -m bench.bim_edit.published
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from bench.common.hf import download

RUNS_REPO = "BIM-Edit/BIM-Edit-runs"
MODELS = ["claude-sonnet", "deepseek-v3.2", "gemini-flash-3.0", "gemma4-31B", "gpt-5.4-mini", "gpt-5.4", "qwen3.6-plus"]
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "bim_edit" / "runs"
OUT = Path(__file__).resolve().parent / "results" / "published_runs.json"
# Paper, Table 2: a task is solved when geometry, semantics and topology are each >= 0.98.
SOLVED = 0.98


def _f(x: str) -> float:
    try:
        v = float(x)
        return 0.0 if v != v else v
    except ValueError:
        return 0.0


def summarize(model: str) -> dict:
    d = DATA_DIR / model
    per_task = download(RUNS_REPO, f"{model}/eval/per_task.csv", d / "per_task.csv")
    cfg = json.loads(download(RUNS_REPO, f"{model}/config.json", d / "config.json").read_text())
    rows = list(csv.DictReader(per_task.open(newline="")))
    fs = [_f(r["final_score"]) for r in rows]
    iters = [_f(r["tool_iterations"]) for r in rows]
    by_cat = {}
    for cat in ("direct", "spatial", "topological"):
        sub = [_f(r["final_score"]) for r in rows if r["category"] == cat]
        by_cat[cat] = round(sum(sub) / len(sub), 4)
    by_op = {}
    for op in ("create", "update", "delete"):
        sub = [_f(r["final_score"]) for r in rows if r["operation"] == op]
        by_op[op] = round(sum(sub) / len(sub), 4)
    return {
        "model": cfg["model_name"],
        "max_tool_calls": cfg["agent"]["max_tool_calls"],
        "n_tasks": len(rows),
        "mean_final_score": round(sum(fs) / len(fs), 4),
        "geometry": round(sum(_f(r["geometry"]) for r in rows) / len(rows), 4),
        "semantics": round(sum(_f(r["semantics"]) for r in rows) / len(rows), 4),
        "topology": round(sum(_f(r["topology"]) for r in rows) / len(rows), 4),
        "solve_rate_pct": round(100 * sum(all(_f(r[k]) >= SOLVED for k in ("geometry", "semantics", "topology"))
                                          for r in rows) / len(rows), 1),
        "solved_exact": sum(x >= 0.99995 for x in fs),
        f"solved_ge_{SOLVED}": sum(x >= SOLVED for x in fs),
        "solved_ge_0.98_pct": round(100 * sum(x >= SOLVED for x in fs) / len(fs), 1),
        "hit_20_calls": sum(x >= 20 for x in iters),
        "hit_20_calls_pct": round(100 * sum(x >= 20 for x in iters) / len(iters), 1),
        "cost_usd_total": round(sum(_f(r["cost_usd"]) for r in rows), 2),
        "mean_seconds": round(sum(_f(r["duration_seconds"]) for r in rows) / len(rows), 1),
        "mean_input_tokens": round(sum(_f(r["input_tokens"]) for r in rows) / len(rows)),
        "by_category": by_cat,
        "by_operation": by_op,
    }


def main() -> None:
    table = {m: summarize(m) for m in MODELS}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(table, indent=2))
    cols = ["mean_final_score", "solve_rate_pct", "solved_exact", "solved_ge_0.98", "hit_20_calls_pct", "cost_usd_total", "mean_seconds", "mean_input_tokens"]
    print("model".ljust(18) + "".join(c[:16].rjust(18) for c in cols))
    for m, s in table.items():
        print(m.ljust(18) + "".join(str(s[c]).rjust(18) for c in cols))


if __name__ == "__main__":
    main()
