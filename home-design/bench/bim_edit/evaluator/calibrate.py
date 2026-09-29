"""Compare the rebuilt scorer with the authors' published per-task evaluations.

    python -m bench.bim_edit.evaluator.calibrate --models gpt-5.4 claude-sonnet --scene artificial --workers 3

Needs the input, ground-truth and edited files under data/bim_edit/ (see the download
step in docs/gates/phase-0.md). Writes bench/bim_edit/results/calibration.json.
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path, PurePosixPath

import numpy as np

from bench.bim_edit.tasks import load

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "bim_edit"
OUT = ROOT / "bench" / "bim_edit" / "results" / "calibration.json"
KEYS = ("geometry", "semantics", "topology", "final_score")


def _one(args):
    model, t = args
    from .evaluate import evaluate_files

    stem = PurePosixPath(t["input_ifc"]).stem
    edited = DATA / "runs" / model / "edited" / t["task_id"] / f"{stem}_0.ifc"
    try:
        r = evaluate_files(t["task_id"], DATA / "dataset" / t["input_ifc"], DATA / "dataset" / t["ground_truth_ifc"],
                           edited if edited.exists() else None)
        return model, t["task_id"], r, None
    except Exception as e:  # recorded, not hidden
        return model, t["task_id"], None, repr(e)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["gpt-5.4", "claude-sonnet", "gpt-5.4-mini", "gemini-flash-3.0"])
    ap.add_argument("--scene", default="artificial")
    ap.add_argument("--tasks", default=None)
    ap.add_argument("--workers", type=int, default=3)
    args = ap.parse_args(argv)
    tasks = [t for t in load() if t["scene"] == args.scene]
    if args.tasks:
        want = set(args.tasks.split(","))
        tasks = [t for t in tasks if t["task_id"] in want]
    jobs = [(m, t) for m in args.models for t in tasks]
    pubs = {m: json.loads((DATA / "runs" / m / "eval_cache.json").read_text()) for m in args.models}
    rows, errors = [], []
    with ProcessPoolExecutor(args.workers) as ex:
        for model, tid, r, err in ex.map(_one, jobs, chunksize=4):
            if err:
                errors.append({"model": model, "task_id": tid, "error": err})
                continue
            p = pubs[model][tid]
            row = {"model": model, "task_id": tid, **{f"ours_{k}": r[k] for k in KEYS}, **{f"pub_{k}": p[k] for k in KEYS}}
            for k, v in r["topology_breakdown"].items():
                row[f"ours_{k}"] = v
                row[f"pub_{k}"] = p["topology_breakdown"].get(k)
            row["ours_pairs"] = [(x["gt_guid"], x["candidate_guid"], round(x.get("iou", 0.0), 3)) for x in r["pairings"]]
            row["pub_pairs"] = [(x["gt_guid"], x["candidate_guid"], round(x.get("iou", 0.0), 3)) for x in p["pairings"]]
            row["ours_n"] = (r["n_gt"], r["n_pred"])
            row["custom_topology"] = r["topology_approximate"]
            row["ours_class"] = r["semantics_breakdown"]["class_match"]
            row["pub_class"] = p["semantics_breakdown"].get("class_match")
            row["ours_props"] = r["semantics_breakdown"]["properties"]
            row["pub_props"] = p["semantics_breakdown"].get("properties")
            rows.append(row)
    summary = {"n": len(rows), "errors": len(errors), "models": args.models, "scene": args.scene}
    def agreement(sub, k):
        d = np.array([abs(r[f"ours_{k}"] - (r[f"pub_{k}"] or 0.0)) for r in sub])
        return {"n": len(sub), "mae": round(float(d.mean()), 4), "within_0.01": round(float((d <= 0.01).mean()), 3),
                "within_0.05": round(float((d <= 0.05).mean()), 3)}

    default = [r for r in rows if not r["custom_topology"]]
    for k in list(KEYS) + ["class", "props", "delta_node_f1", "delta_edge_f1"]:
        summary[k] = agreement(rows, k)
        summary[f"{k}__default_topology_tasks"] = agreement(default, k)
    # Model-level means, the numbers the paper reports.
    for m in args.models:
        rm = [r for r in rows if r["model"] == m]
        summary[f"mean_final_{m}"] = {"ours": round(float(np.mean([r["ours_final_score"] for r in rm])), 4),
                                      "published": round(float(np.mean([r["pub_final_score"] for r in rm])), 4)}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"summary": summary, "rows": rows, "errors": errors}, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
