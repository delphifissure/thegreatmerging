"""Grade IFC-Bench answers with Claude through headless Claude Code (no API key).

    python -m bench.claude_code.judge --run-id gemma4-31b --judge-model claude-opus-5-5

Writes judged-cc-<judge-model>.jsonl; score it with
    python -m bench.ifc_bench.score --run-id gemma4-31b --judge-model cc-<judge-model>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from bench.ifc_bench import prompts
from bench.ifc_bench.data import test_split
from bench.ifc_bench.run import RUNS_DIR

from .cli import run_claude
from .loop import load_done, run_items


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--judge-model", default="claude-opus-5-5")
    ap.add_argument("--effort", default="medium")
    ap.add_argument("--workers", type=int, default=3)
    args = ap.parse_args(argv)

    run_dir = RUNS_DIR / args.run_id
    answers = list({a["id"]: a for a in map(json.loads, filter(str.strip,
                    (run_dir / "answers.jsonl").read_text().splitlines()))}.values())
    answers = [a for a in answers if a["stop"] not in ("error", "rate_limited", "timeout")]
    refs = {q.id: q for q in test_split()}
    out: Path = run_dir / f"judged-cc-{args.judge_model}.jsonl"
    done = load_done(out, "id")
    todo = [a for a in answers if a["id"] not in done]

    def work(a) -> dict:
        q = refs[a["id"]]
        run = run_claude(prompts.judge_user(q.question, q.ground_truth, a["answer"]), prompts.JUDGE_SYSTEM,
                         args.judge_model, effort=args.effort, json_schema=prompts.JUDGE_SCHEMA, timeout_s=600)
        verdict = run.structured or {}
        stop = "rate_limited" if run.rate_limited else ("judged" if verdict.get("label") else "error")
        return {"id": a["id"], "category": a["category"], "label": verdict.get("label", "error"),
                "reason": verdict.get("reason", run.text[:500]), "stop": stop, "seconds": run.seconds,
                "tool_calls": 0, "judge_model": args.judge_model, "judge_harness": "claude-code-headless",
                "judge_prompt_version": prompts.JUDGE_PROMPT_VERSION}

    run_items(todo, lambda a: a["id"], work, out, args.workers, label=lambda a: f"q{a['id']}")


if __name__ == "__main__":
    main()
