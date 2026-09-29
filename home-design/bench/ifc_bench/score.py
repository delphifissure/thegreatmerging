"""Accuracy on the fixed split with partial answers counted wrong, plus cost and time."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict

from .run import RUNS_DIR


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def score(judged: list[dict], answers: list[dict]) -> dict:
    by_id = {a["id"]: a for a in answers}
    cats: dict[str, list[str]] = defaultdict(list)
    for j in judged:
        cats["all"].append(j["label"])
        cats[f"cat{j['category']}"].append(j["label"])
    out = {}
    for k, labels in sorted(cats.items()):
        n = len(labels)
        c = labels.count("correct")
        out[k] = {"n": n, "correct": c, "partial": labels.count("partial"),
                  "accuracy_strict": c / n if n else 0.0, "ci95": wilson(c, n),
                  "accuracy_partial_as_correct": (c + labels.count("partial")) / n if n else 0.0}
    a = [by_id[j["id"]] for j in judged if j["id"] in by_id]
    if a:
        out["per_question"] = {
            "mean_seconds": sum(x["seconds"] for x in a) / len(a),
            "mean_tool_calls": sum(x["tool_calls"] for x in a) / len(a),
            "mean_input_tokens": sum(x["input_tokens"] for x in a) / len(a),
            "mean_output_tokens": sum(x["output_tokens"] for x in a) / len(a),
            "mean_cost_usd": sum(x["cost_usd"] for x in a) / len(a),
            "hit_call_budget": sum(x["stop"] in ("call_budget", "answered_after_budget") for x in a),
            "errors": sum(x["stop"] == "error" for x in a),
        }
    return out


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--judge-model", default="claude-opus-5-5")
    args = ap.parse_args(argv)
    d = RUNS_DIR / args.run_id
    judged = [json.loads(l) for l in (d / f"judged-{args.judge_model}.jsonl").read_text().splitlines() if l.strip()]
    answers = [json.loads(l) for l in (d / "answers.jsonl").read_text().splitlines() if l.strip()]
    result = score(judged, answers)
    (d / f"score-{args.judge_model}.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
