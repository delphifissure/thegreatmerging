"""BIM-Edit scorer rebuilt from the paper (arXiv 2606.20146v3, section 3.2 and appendix E)
and calibrated against the authors' published per-task evaluations.

Two modes:
- "released" reproduces what the authors' evaluator produced in their published runs:
  topology is the mean of the seven topology rule values, and on delete tasks the
  semantic score compares the target with whatever still carries its GlobalId in the
  edited model (so a correct delete scores 0 and a skipped delete scores 1).
- "paper" follows the paper's text: topology is lambda*F1(nodes) + (1-lambda)*F1(edges),
  and a delete task's semantic score is 1 when the target is gone, else 0.

    python -m bench.bim_edit.evaluator.evaluate <task_id> <input.ifc> <ground_truth.ifc> <edited.ifc>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import ifcopenshell
from scipy.optimize import linear_sum_assignment
import numpy as np

from . import geometry, semantics, topology

PINS = json.loads((Path(__file__).resolve().parents[1] / "pinned_guids.json").read_text())
# Tasks whose released evaluation used task-specific topology rules we cannot reproduce
# (their definitions live in the non-public task metadata). Scored with the default rules
# and flagged "topology_approximate".
CUSTOM_TOPOLOGY = set(json.loads((Path(__file__).resolve().parents[1] / "custom_topology_tasks.json").read_text())["tasks"])
ENTITY = {"COL": "IfcColumn", "WAL": "IfcWall", "WIN": "IfcWindow", "DOR": "IfcDoor", "SLB": "IfcSlab", "ROM": "IfcSpace"}
MIN_IOU = 0.05
OPS = {"CRE": "create", "UPD": "update", "DEL": "delete"}


def _by_guid(model, gid):
    try:
        return model.by_guid(gid)
    except RuntimeError:
        return None


def _of_type(model, cls):
    return {e.GlobalId: e for e in model.by_type(cls)}


def pools(task_id: str, m0, mstar, mpred):
    """Reference and predicted edit sets: (gt entities, their model), (pred entities, their model)."""
    op = OPS[task_id.split("-")[1]]
    cls = ENTITY[task_id[:3]]
    t0, ts, tp = _of_type(m0, cls), _of_type(mstar, cls), _of_type(mpred, cls)
    if op == "create":
        gt = [ts[g] for g in sorted(set(ts) - set(t0))]
        pred = [tp[g] for g in sorted(set(tp) - set(t0))]
        return op, cls, gt, pred
    pin = PINS[task_id]["pinned_guid"]
    if op == "update":
        g = _by_guid(mstar, pin)
        gt = [g] if g is not None and g.is_a(cls) else []
        p = _by_guid(mpred, pin)
        pred = ([p] if p is not None else []) + [tp[x] for x in sorted(set(tp) - set(t0))]
        return op, cls, gt, pred
    g = _by_guid(m0, pin)
    gt = [g] if g is not None and _by_guid(mstar, pin) is None else []
    pred = [t0[x] for x in sorted(set(t0) - set(tp))]
    return op, cls, gt, pred


def evaluate(task_id: str, m0, mstar, mpred, mode: str = "released") -> dict:
    assert mode in ("released", "paper")
    op, cls, gt, pred = pools(task_id, m0, mstar, mpred)
    gt_meshes = [geometry.triangles(e) for e in gt]
    pred_meshes = [geometry.triangles(e) for e in pred]
    pooled_geo, pooled_d = geometry.score(gt_meshes, pred_meshes)

    # Semantics: one-to-one OBB-IoU matching of reference to predicted entities.
    pairings = []
    match: dict[int, int] = {}
    if op == "delete":
        pin = PINS[task_id]["pinned_guid"]
        target = _by_guid(m0, pin)
        still_there = _by_guid(mpred, pin)
        if target is None:
            sem_cls = sem_prop = 0.0
        elif mode == "released":
            sem_cls, sem_prop, _ = semantics.pair_score(target, still_there)
        else:
            sem_cls = sem_prop = 1.0 if still_there is None else 0.0
        pairings.append({"gt_guid": pin, "candidate_guid": still_there.GlobalId if still_there else None})
    elif not gt:
        sem_cls = sem_prop = 0.0
    else:
        boxes_g = [geometry.obb(m) for m in gt_meshes]
        boxes_p = [geometry.obb(m) for m in pred_meshes]
        iou = np.array([[geometry.obb_iou(a, b) for b in boxes_p] for a in boxes_g]) if pred else np.zeros((len(gt), 0))
        if iou.size:
            rows, cols = linear_sum_assignment(-iou)
            match = {r: c for r, c in zip(rows, cols) if iou[r, c] >= MIN_IOU}
        cls_scores, prop_scores = [], []
        for i, g in enumerate(gt):
            p = pred[match[i]] if i in match else None
            c, pr, _ = semantics.pair_score(g, p)
            if mode == "released" and c == 0.0:
                pr = 0.0  # released runs: a class mismatch also zeroes the property score
            cls_scores.append(c)
            prop_scores.append(pr)
            pairings.append({"gt_guid": g.GlobalId, "candidate_guid": p.GlobalId if p else None,
                             "iou": float(iou[i, match[i]]) if i in match else 0.0})
        sem_cls, sem_prop = float(np.mean(cls_scores)), float(np.mean(prop_scores))
    sem = (sem_cls + sem_prop) / 2

    # Geometry. Paper: pooled median Chamfer over the whole edit set. Released: the median of
    # per-pair scores over reference entities matched by OBB IoU, unmatched ones scoring 0
    # (for deletes the removed entities are compared as a pool, as in the released runs).
    if mode == "paper" or op == "delete":
        geo, geo_d = pooled_geo, {"pooled": pooled_d}
    elif not gt:
        geo, geo_d = (1.0 if not pred else 0.0), {"skipped": "gt_pool_empty"}
    else:
        per_pair = []
        for i in range(len(gt)):
            if i in match:
                per_pair.append(geometry.score([gt_meshes[i]], [pred_meshes[match[i]]])[0])
            else:
                per_pair.append(0.0)
        geo = float(np.median(per_pair))
        geo_d = {"per_pair": per_pair, "pooled_score": pooled_geo, "pooled": pooled_d}

    if mode == "paper":
        rules, topo_d = topology.score(m0, mstar, mpred)
        topo = rules["delta_topology_score"]
    else:
        # A class mismatch scores the pair 0 on topology, as in the released runs.
        pair_ids = [(pp["gt_guid"], pp["candidate_guid"]) for pp in pairings]
        mismatched = {pp["gt_guid"] for pp in pairings if pp["candidate_guid"] and op != "delete"
                      and _by_guid(mpred, pp["candidate_guid"]).is_a() != _by_guid(mstar, pp["gt_guid"]).is_a()}
        pair_ids = [(g, None if g in mismatched else c) for g, c in pair_ids]
        per_pair, topo_d = topology.score_pairs(m0, mstar, mpred, op, pair_ids, [e.GlobalId for e in pred])
        if op == "delete" and PINS[task_id]["pin_status"] != "ok":
            per_pair = []  # released runs: a missing pinned id gives topology 0
        if per_pair:
            rules = {k: float(np.mean([r[k] for r in per_pair])) for k in topology.RULES}
        else:
            rules = dict.fromkeys(topology.RULES, 0.0)
        topo = float(np.mean(list(rules.values())))
    return {"task_id": task_id, "mode": mode, "operation": op, "entity_type": cls,
            "geometry": geo, "semantics": sem, "topology": topo, "final_score": (geo + sem + topo) / 3,
            "semantics_breakdown": {"class_match": sem_cls, "properties": sem_prop},
            "topology_breakdown": rules, "geometry_details": geo_d, "topology_details": topo_d,
            "pairings": pairings, "n_gt": len(gt), "n_pred": len(pred),
            "topology_approximate": mode == "released" and task_id in CUSTOM_TOPOLOGY}


def evaluate_files(task_id, input_path, gt_path, edited_path, mode="released") -> dict:
    m0 = ifcopenshell.open(str(input_path))
    ms = ifcopenshell.open(str(gt_path))
    mp = ifcopenshell.open(str(edited_path)) if edited_path and Path(edited_path).exists() else m0
    return evaluate(task_id, m0, ms, mp, mode)


if __name__ == "__main__":
    print(json.dumps(evaluate_files(*sys.argv[1:5]), indent=2, default=str))
