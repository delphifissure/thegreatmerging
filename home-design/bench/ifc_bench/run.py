"""Run a model on the IFC-Bench fixed test split and store its answers.

    python -m bench.ifc_bench.run --backend vllm --model google/gemma-4-31B-it \\
        --base-url https://<pod>-8000.proxy.runpod.net/v1 --run-id gemma4-31b --workers 6
    python -m bench.ifc_bench.run --backend anthropic --model claude-opus-5-5 --run-id opus55

Answers go to runs/ifc_bench/<run-id>/answers.jsonl, one line per question. The run
resumes: questions already answered are skipped. Questions are grouped by IFC file so
each worker opens a file once.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bench.common.agent import EXECUTE_TOOL, run_agent
from bench.common.budget import Budget
from bench.common.hf import dataset_sha
from bench.common.llm import AnthropicChat, OpenAICompatChat
from bench.common.sandbox import IfcSandbox

from . import prompts
from .data import REPO, Question, ifc_path, test_split

RUNS_DIR = Path(__file__).resolve().parents[2] / "runs" / "ifc_bench"
MAX_TOOL_CALLS = 20


def make_chat(args):
    if args.backend == "anthropic":
        return AnthropicChat(args.model, prompts.AGENT_SYSTEM, [EXECUTE_TOOL], effort=args.effort)
    return OpenAICompatChat(args.model, prompts.AGENT_SYSTEM, [EXECUTE_TOOL], base_url=args.base_url,
                            api_key=args.api_key, temperature=args.temperature)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["anthropic", "vllm"], required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--base-url")
    ap.add_argument("--api-key", default="EMPTY")
    ap.add_argument("--effort", default=None, help="Claude effort level")
    ap.add_argument("--temperature", type=float, default=None)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=None, help="first N questions (smoke tests)")
    ap.add_argument("--ids", default=None, help="comma-separated question ids")
    ap.add_argument("--max-usd-per-question", type=float, default=1.0)
    args = ap.parse_args(argv)

    out_dir = RUNS_DIR / args.run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    answers_file = out_dir / "answers.jsonl"
    done = set()
    if answers_file.exists():
        done = {json.loads(l)["id"] for l in answers_file.read_text().splitlines() if l.strip()}

    qs = test_split()
    if args.ids:
        want = {int(x) for x in args.ids.split(",")}
        qs = [q for q in qs if q.id in want]
    if args.limit:
        qs = qs[: args.limit]
    todo = [q for q in qs if q.id not in done]

    manifest = {
        "run_id": args.run_id, "backend": args.backend, "model": args.model, "effort": args.effort,
        "temperature": args.temperature, "max_tool_calls": MAX_TOOL_CALLS,
        "dataset": REPO, "dataset_sha": dataset_sha(REPO),
        "agent_prompt_version": prompts.AGENT_PROMPT_VERSION,
        "agent_prompt_sha256": hashlib.sha256(prompts.AGENT_SYSTEM.encode()).hexdigest(),
        "started": time.strftime("%Y-%m-%dT%H:%M:%S"), "n_selected": len(qs), "n_todo": len(todo),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    budget = Budget.load()
    if args.backend == "anthropic":
        budget.require(len(todo) * 0.05, f"IFC-Bench {args.run_id} (rough floor of $0.05 per question)")

    groups: dict[str, list[Question]] = defaultdict(list)
    for q in todo:
        groups[q.ifc_rel_path].append(q)
    lock = threading.Lock()
    counter = {"n": 0}

    def work(rel_path: str) -> None:
        group = groups[rel_path]
        path = ifc_path(group[0])
        with IfcSandbox(path) as sb:
            for q in group:
                if args.backend == "anthropic" and budget.remaining() <= 0:
                    return
                res = run_agent(make_chat(args), sb, q.question, MAX_TOOL_CALLS, args.max_usd_per_question)
                rec = {"id": q.id, "category": q.category, "project": q.project, "ifc_model": q.ifc_model,
                       "question": q.question, **res.to_dict()}
                with lock:
                    with answers_file.open("a") as f:
                        f.write(json.dumps(rec) + "\n")
                    if res.cost_usd:
                        budget.record(res.cost_usd, "anthropic", f"ifcb:{args.run_id}", {"id": q.id})
                    counter["n"] += 1
                    print(f"[{counter['n']}/{len(todo)}] q{q.id} cat{q.category} {res.stop} "
                          f"calls={res.tool_calls} {res.seconds:.0f}s ${res.cost_usd:.3f}", flush=True)

    # Largest groups first so the long files do not finish last.
    order = sorted(groups, key=lambda k: -len(groups[k]))
    with ThreadPoolExecutor(args.workers) as ex:
        for f in [ex.submit(work, k) for k in order]:
            f.result()


if __name__ == "__main__":
    main()
