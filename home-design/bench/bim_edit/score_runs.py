"""Score BIM-Edit edits from several runs on the same tasks with the rebuilt scorer.

    python -m bench.bim_edit.score_runs --ours cc-sonnet55-cell1 --published gpt-5.4 claude-sonnet --subset cell1

"ours" runs live in runs/bim_edit/<run-id>/ (bench.claude_code.run_bim_edit); published
runs are the authors' edited files under data/bim_edit/runs/<model>/edited/. Every run is
scored in both scorer modes on the same tasks, and the authors' own published score is
shown alongside where it exists. Writes bench/bim_edit/results/scores_<name>.json.
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path, PurePosixPath

import numpy as np

from bench.bim_edit.tasks import load
from bench.claude_code.run_bim_edit import stratified

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "bim_edit"
RESULTS = Path(__file__).resolve().parent / "results"


def edited_path(run: str, kind: str, t: dict) -> Path:
    stem = PurePosixPath(t["input_ifc"]).stem
    base = ROOT / "runs" / "bim_edit" / run if kind == "ours" else DATA / "runs" / run
    return base / "edited" / t["task_id"] / f"{stem}_0.ifc"


def _one(job):
    run, kind, t = job
    from bench.bim_edit.evaluator.evaluate import evaluate_files

    p = edited_path(run, kind, t)
    out = {"run": run, "kind": kind, "task_id": t["task_id"], "scene": t["scene"], "edited_found": p.exists()}
    for mode in ("released", "paper"):
        r = evaluate_files(t["task_id"], DATA / "dataset" / t["input_ifc"], DATA / "dataset" / t["ground_truth_ifc"],
                           p if p.exists() else None, mode=mode)
        out[mode] = {k: r[k] for k in ("geometry", "semantics", "topology", "final_score")}
        out[mode]["solved"] = all(r[k] >= 0.98 for k in ("geometry", "semantics", "topology"))
        out["topology_approximate"] = r["topology_approximate"]
    return out


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ours", nargs="*", default=[])
    ap.add_argument("--published", nargs="*", default=[])
    ap.add_argument("--subset", default="cell1", help="cell1 (18-task stratified subset) or all")
    ap.add_argument("--scene", default=None)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--name", default=None)
    args = ap.parse_args(argv)
    tasks = stratified(load(), 1) if args.subset == "cell1" else load()
    if args.scene:
        tasks = [t for t in tasks if t["scene"] == args.scene]
    jobs = [(r, "ours", t) for r in args.ours for t in tasks] + [(r, "published", t) for r in args.published for t in tasks]
    pubs = {m: json.loads((DATA / "runs" / m / "eval_cache.json").read_text()) for m in args.published}
    with ProcessPoolExecutor(args.workers) as ex:
        rows = list(ex.map(_one, jobs))
    for r in rows:
        if r["kind"] == "published":
            p = pubs[r["run"]][r["task_id"]]
            r["authors_score"] = {k: p[k] for k in ("geometry", "semantics", "topology", "final_score")}
    summary = {}
    for run in args.ours + args.published:
        rr = [r for r in rows if r["run"] == run]
        s = {"n": len(rr), "edited_found": sum(r["edited_found"] for r in rr)}
        for mode in ("released", "paper"):
            s[mode] = {k: round(float(np.mean([r[mode][k] for r in rr])), 4) for k in ("geometry", "semantics", "topology", "final_score")}
            s[mode]["solved"] = sum(r[mode]["solved"] for r in rr)
        if rr and "authors_score" in rr[0]:
            s["authors_final_score"] = round(float(np.mean([r["authors_score"]["final_score"] for r in rr])), 4)
        summary[run] = s
    name = args.name or f"{args.subset}{'_' + args.scene if args.scene else ''}"
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / f"scores_{name}.json").write_text(json.dumps({"tasks": [t["task_id"] for t in tasks],
                                                             "summary": summary, "rows": rows}, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
