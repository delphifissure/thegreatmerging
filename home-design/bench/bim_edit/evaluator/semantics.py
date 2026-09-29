"""Class and property checks for matched entity pairs (paper eq. 3, appendix E.2)."""

from __future__ import annotations

import ifcopenshell.util.element

IGNORE = {"Tag", "Description", "LongName"}  # released config: properties_ignore
NOT_COMPARED = {"GlobalId", "OwnerHistory", "CompositionType"}  # never in published property keys
TOLERANCE = 0.05


def properties(entity) -> dict:
    """Simple direct attributes plus property-set values (no quantity sets), keyed like the released evaluator."""
    out = {}
    info = entity.get_info(recursive=False)
    for k, v in info.items():
        if k in IGNORE or k in NOT_COMPARED or k in ("id", "type") or v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            out[k] = v
    for pset, props in ifcopenshell.util.element.get_psets(entity, psets_only=True).items():
        for k, v in props.items():
            if k == "id" or k in IGNORE or v is None or isinstance(v, (list, tuple, dict)):
                continue
            out[f"{pset}.{k}"] = v
    return out


def _equal(expected, actual) -> bool:
    if actual is None:
        return False
    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected == actual
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        if expected == 0:
            return abs(actual) <= TOLERANCE
        return abs(actual - expected) <= TOLERANCE * abs(expected)
    return expected == actual


def property_score(gt, pred) -> tuple[float, dict]:
    exp = properties(gt)
    act = properties(pred) if pred is not None else {}
    if not exp:
        return 1.0, {"n_keys": 0}
    passed = [k for k, v in exp.items() if _equal(v, act.get(k))]
    failed = [{"key": k, "expected": v, "actual": act.get(k)} for k, v in exp.items() if k not in passed]
    return len(passed) / len(exp), {"n_keys": len(exp), "passed": passed, "failed": failed}


def pair_score(gt, pred) -> tuple[float, float, dict]:
    """(class match, property score, details) for one matched pair."""
    if pred is None:
        return 0.0, 0.0, {"skipped": "no_match"}
    cls = 1.0 if pred.is_a() == gt.is_a() else 0.0
    prop, details = property_score(gt, pred)
    return cls, prop, details
