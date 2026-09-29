"""Grade stored answers with a Claude judge. Partial answers count as wrong.

    python -m bench.ifc_bench.judge --run-id gemma4-31b [--judge-model claude-opus-5-5]
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bench.common.budget import Budget, anthropic_cost

from . import prompts
from .data import test_split
from .run import RUNS_DIR


def judge_one(client, model: str, question: str, reference: str, candidate: str) -> tuple[dict, float]:
    resp = client.messages.create(
        model=model, max_tokens=4000, system=prompts.JUDGE_SYSTEM,
        messages=[{"role": "user", "content": prompts.judge_user(question, reference, candidate)}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": prompts.JUDGE_SCHEMA}},
    )
    if resp.stop_reason == "refusal":
        return {"label": "error", "reason": "judge refused"}, 0.0
    text = next(b.text for b in resp.content if b.type == "text")
    usage = resp.usage.model_dump()
    return json.loads(text), anthropic_cost(model, usage)


def main(argv=None) -> None:
    import anthropic

    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--judge-model", default="claude-opus-5-5")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args(argv)

    run_dir = RUNS_DIR / args.run_id
    # Last record per question wins, so retried questions replace their errored attempts.
    answers = list({a["id"]: a for a in map(json.loads, filter(str.strip,
                    (run_dir / "answers.jsonl").read_text().splitlines()))}.values())
    refs = {q.id: q for q in test_split()}
    out = run_dir / f"judged-{args.judge_model}.jsonl"
    done = set()
    if out.exists():
        done = {json.loads(l)["id"] for l in out.read_text().splitlines() if l.strip()}
    todo = [a for a in answers if a["id"] not in done]

    budget = Budget.load()
    budget.require(len(todo) * 0.01, f"judging {args.run_id}")
    client = anthropic.Anthropic()

    def work(a):
        q = refs[a["id"]]
        verdict, cost = judge_one(client, args.judge_model, q.question, q.ground_truth, a["answer"])
        return a, verdict, cost

    with ThreadPoolExecutor(args.workers) as ex, out.open("a") as f:
        for a, verdict, cost in ex.map(work, todo):
            f.write(json.dumps({"id": a["id"], "category": a["category"], **verdict,
                                "judge_model": args.judge_model,
                                "judge_prompt_version": prompts.JUDGE_PROMPT_VERSION}) + "\n")
            budget.record(cost, "anthropic", f"ifcb-judge:{args.run_id}", {"id": a["id"]})


if __name__ == "__main__":
    main()
