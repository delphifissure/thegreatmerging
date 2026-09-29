"""BIM-Edit through headless Claude Code, on the Claude plan (no API key).

    python -m bench.claude_code.run_bim_edit --model claude-sonnet-5-5 --run-id cc-sonnet55 --workers 2
    python -m bench.claude_code.run_bim_edit ... --per-cell 1     # stratified subset: 18 tasks

Kept from the paper's harness (published config.json): the system prompt word for word,
one raw code tool with `ifc` preloaded, a 20-call budget, a 420 s tool timeout, one
sample per task. Different: the agent loop is Claude Code's, not the authors' LangGraph
agent, and the tool refuses calls past the budget instead of the loop erroring. Results
are therefore labelled "claude-code harness" and are not a like-for-like reproduction.

Edited models are written to runs/bim_edit/<run-id>/edited/<task_id>/<input stem>_0.ifc,
the layout of the authors' published runs, for scoring with their evaluator.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

from bench.bim_edit.tasks import DATA_REPO, load
from bench.common.hf import dataset_sha, download

from .cli import mcp_config, run_claude
from .common import record, wait_for_final_save
from .loop import load_done, run_items

ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = ROOT / "runs" / "bim_edit"
DATA_DIR = ROOT / "data" / "bim_edit" / "dataset"
MAX_TOOL_CALLS = 20
TOOL_TIMEOUT_S = 420
# Verbatim from the authors' published config.json (BIM-Edit/BIM-Edit-runs, claude-sonnet/config.json).
PAPER_SYSTEM_PROMPT = (
    "You are a BIM assistant, with a deep knowledge in Building Information Modeling. You are working with "
    "IFC files and need to create IFCOpenshell calls to fulfill the task. Make sure to understand the "
    "current model before modification and modify the model always correctly on geometry, topology and "
    "semantics. Always understand the unit scale of the model. Use sensible defaults for unspecified "
    "values. Execute commands directly and never ask for confirmation."
)


def stratified(tasks: list[dict], per_cell: int) -> list[dict]:
    """First `per_cell` tasks (by id) of each operation x category x scene cell: 18 cells."""
    cells: dict[tuple, list] = defaultdict(list)
    for t in sorted(tasks, key=lambda t: t["task_id"]):
        cells[(t["operation"], t["category"], t["scene"])].append(t)
    return [t for c in sorted(cells) for t in cells[c][:per_cell]]


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--effort", default=None)
    ap.add_argument("--workers", type=int, default=2, help="large models need ~4 GB RAM each")
    ap.add_argument("--per-cell", type=int, default=None, help="stratified subset size per cell")
    ap.add_argument("--tasks", default=None, help="comma-separated task ids")
    ap.add_argument("--timeout", type=int, default=3600)
    args = ap.parse_args(argv)

    tasks = load()
    if args.tasks:
        want = set(args.tasks.split(","))
        tasks = [t for t in tasks if t["task_id"] in want]
    elif args.per_cell:
        tasks = stratified(tasks, args.per_cell)
    out_dir = RUNS_DIR / args.run_id
    (out_dir / "calls").mkdir(parents=True, exist_ok=True)
    results = out_dir / "results.jsonl"
    done = load_done(results, "task_id")
    todo = [t for t in tasks if t["task_id"] not in done]
    (out_dir / "manifest.json").write_text(json.dumps({
        "run_id": args.run_id, "harness": "claude-code-headless", "model": args.model, "effort": args.effort,
        "system_prompt": PAPER_SYSTEM_PROMPT, "max_tool_calls": MAX_TOOL_CALLS, "tool_timeout_s": TOOL_TIMEOUT_S,
        "dataset": DATA_REPO, "dataset_sha": dataset_sha(DATA_REPO), "task_ids": [t["task_id"] for t in tasks],
        "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }, indent=2))

    def work(t) -> dict:
        src = download(DATA_REPO, t["input_ifc"], DATA_DIR / t["input_ifc"])
        edited = out_dir / "edited" / t["task_id"] / f"{src.stem}_0.ifc"
        edited.parent.mkdir(parents=True, exist_ok=True)
        edited.unlink(missing_ok=True)
        log = out_dir / "calls" / f"{t['task_id']}.jsonl"
        log.unlink(missing_ok=True)
        mcp = mcp_config(str(src), "edit", MAX_TOOL_CALLS, str(log), save=str(edited))
        mcp["mcpServers"]["ifc"]["args"] += ["--timeout", str(TOOL_TIMEOUT_S)]
        run = run_claude(t["prompt"], PAPER_SYSTEM_PROMPT, args.model, effort=args.effort, mcp=mcp,
                         timeout_s=args.timeout)
        saved = wait_for_final_save(log) if run.subtype != "timeout" else None
        rec = record(run, log)
        rec.update({"task_id": t["task_id"], "operation": t["operation"], "category": t["category"],
                    "scene": t["scene"], "prompt": t["prompt"], "input_ifc": t["input_ifc"],
                    "ground_truth_ifc": t["ground_truth_ifc"],
                    "edited_ifc": str(edited.relative_to(out_dir)) if edited.exists() else None,
                    "final_save": saved})
        return rec

    run_items(todo, lambda t: t["task_id"], work, results, args.workers, label=lambda t: t["task_id"])


if __name__ == "__main__":
    main()
