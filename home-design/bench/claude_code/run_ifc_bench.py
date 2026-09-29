"""IFC-Bench fixed test split through headless Claude Code, on the Claude plan.

    python -m bench.claude_code.run_ifc_bench --model claude-sonnet-5-5 --run-id cc-sonnet55 --workers 2

Writes runs/ifc_bench/<run-id>/answers.jsonl in the same format as bench.ifc_bench.run,
so bench.claude_code.judge and bench.ifc_bench.score work on it unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time

from bench.common.hf import dataset_sha
from bench.ifc_bench import prompts
from bench.ifc_bench.data import REPO, ifc_path, test_split
from bench.ifc_bench.run import MAX_TOOL_CALLS, RUNS_DIR

from .cli import mcp_config, run_claude
from .common import record
from .loop import load_done, run_items


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--effort", default=None)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--ids", default=None)
    ap.add_argument("--timeout", type=int, default=1500)
    args = ap.parse_args(argv)

    out_dir = RUNS_DIR / args.run_id
    (out_dir / "calls").mkdir(parents=True, exist_ok=True)
    answers = out_dir / "answers.jsonl"
    qs = test_split()
    if args.ids:
        want = {int(x) for x in args.ids.split(",")}
        qs = [q for q in qs if q.id in want]
    if args.limit:
        qs = qs[: args.limit]
    done = load_done(answers, "id")
    todo = [q for q in qs if q.id not in done]
    (out_dir / "manifest.json").write_text(json.dumps({
        "run_id": args.run_id, "harness": "claude-code-headless", "model": args.model, "effort": args.effort,
        "max_tool_calls": MAX_TOOL_CALLS, "dataset": REPO, "dataset_sha": dataset_sha(REPO),
        "agent_prompt_version": prompts.AGENT_PROMPT_VERSION,
        "agent_prompt_sha256": hashlib.sha256(prompts.AGENT_SYSTEM.encode()).hexdigest(),
        "started": time.strftime("%Y-%m-%dT%H:%M:%S"), "n_selected": len(qs), "n_todo": len(todo),
    }, indent=2))

    def work(q) -> dict:
        log = out_dir / "calls" / f"q{q.id}.jsonl"
        log.unlink(missing_ok=True)
        run = run_claude(q.question, prompts.AGENT_SYSTEM, args.model, effort=args.effort,
                         mcp=mcp_config(str(ifc_path(q)), "read", MAX_TOOL_CALLS, str(log)),
                         timeout_s=args.timeout)
        return {"id": q.id, "category": q.category, "project": q.project, "ifc_model": q.ifc_model,
                "question": q.question, **record(run, log)}

    run_items(todo, lambda q: q.id, work, answers, args.workers, label=lambda q: f"q{q.id} cat{q.category}")


if __name__ == "__main__":
    main()
