"""Relation-graph deltas and the topology score (paper eq. 4, appendix E.3).

Nodes are IfcElement and IfcSpatialElement entities keyed by GlobalId. Edges are
(relation kind, from, to) triples from containment, aggregation, space boundaries,
voiding, filling and element connections. The reference edit is the change from the
input model M0 to the ground truth M*, the predicted edit the change from M0 to M'.
New predicted nodes are aligned to new reference nodes greedily by class and position.
"""

from __future__ import annotations

import hashlib

import numpy as np
import ifcopenshell
import ifcopenshell.util.placement

LAMBDA_NODE = 0.3
MIN_MATCH_SCORE = 5.0
NODE_CLASSES = ("IfcElement", "IfcSpatialElement")
EDGE_RELS = {
    "IfcRelContainedInSpatialStructure": ("RelatingStructure", "RelatedElements"),
    "IfcRelAggregates": ("RelatingObject", "RelatedObjects"),
    "IfcRelSpaceBoundary": ("RelatingSpace", "RelatedBuildingElement"),
    "IfcRelVoidsElement": ("RelatingBuildingElement", "RelatedOpeningElement"),
    "IfcRelFillsElement": ("RelatingOpeningElement", "RelatedBuildingElement"),
    "IfcRelConnectsElements": ("RelatingElement", "RelatedElement"),
}


def _round(v):
    if isinstance(v, float):
        return round(v, 6)
    if isinstance(v, (list, tuple)):
        return tuple(_round(x) for x in v)
    return v


def _shape_fingerprint(model, entity) -> str:
    rep = getattr(entity, "Representation", None)
    if rep is None:
        return ""
    h = hashlib.sha1()
    for e in model.traverse(rep):
        info = e.get_info(recursive=False)
        vals = []
        for k, v in info.items():
            if k in ("id",):
                continue
            if isinstance(v, ifcopenshell.entity_instance):
                v = v.is_a()
            elif isinstance(v, (list, tuple)):
                v = tuple(x.is_a() if isinstance(x, ifcopenshell.entity_instance) else _round(x) for x in v)
            vals.append((k, _round(v)))
        h.update(repr(vals).encode())
    return h.hexdigest()


class Graph:
    def __init__(self, model):
        self.model = model
        self.nodes: dict[str, object] = {}
        for cls in NODE_CLASSES:
            for e in model.by_type(cls):
                self.nodes[e.GlobalId] = e
        self.edges: set[tuple[str, str, str]] = set()
        for rel_cls, (src, dst) in EDGE_RELS.items():
            for rel in model.by_type(rel_cls):
                a = getattr(rel, src, None)
                bs = getattr(rel, dst, None)
                if a is None or bs is None:
                    continue
                bs = bs if isinstance(bs, (list, tuple)) else [bs]
                kind = "IfcRelConnectsElements" if rel.is_a("IfcRelConnectsElements") else rel_cls
                for b in bs:
                    if b is None:
                        continue
                    self.edges.add((kind, a.GlobalId, b.GlobalId))
        self._fp: dict[str, tuple] = {}

    def fingerprint(self, gid: str) -> tuple:
        if gid not in self._fp:
            e = self.nodes[gid]
            try:
                m = ifcopenshell.util.placement.get_local_placement(e.ObjectPlacement) if getattr(e, "ObjectPlacement", None) else None
                place = tuple(np.round(m, 4).ravel()) if m is not None else ()
            except Exception:
                place = ()
            attrs = tuple((k, _round(v)) for k, v in e.get_info(recursive=False).items()
                          if k not in ("id", "OwnerHistory", "ObjectPlacement", "Representation")
                          and not isinstance(v, (ifcopenshell.entity_instance, list, tuple)))
            self._fp[gid] = (e.is_a(), attrs, place, _shape_fingerprint(self.model, e))
        return self._fp[gid]

    def origin(self, gid: str) -> np.ndarray:
        e = self.nodes[gid]
        try:
            return np.asarray(ifcopenshell.util.placement.get_local_placement(e.ObjectPlacement))[:3, 3]
        except Exception:
            return np.zeros(3)


def _geometry_signature(entity) -> tuple:
    """Mesh extents and surface area, to mm and cm^2: tells a real shape change from a re-export."""
    from .geometry import area, triangles

    tris = triangles(entity)
    if tris is None:
        return ()
    pts = tris.reshape(-1, 3)
    return tuple(np.round(pts.min(0), 3)) + tuple(np.round(pts.max(0), 3)) + (round(float(area(tris).sum()), 4),)


def _modified(g0: Graph, g1: Graph, n: str) -> bool:
    f0, f1 = g0.fingerprint(n), g1.fingerprint(n)
    if f0[:3] != f1[:3]:
        return True
    if f0[3] == f1[3]:
        return False
    return _geometry_signature(g0.nodes[n]) != _geometry_signature(g1.nodes[n])


def node_delta(g0: Graph, g1: Graph) -> tuple[set, set, set]:
    added = set(g1.nodes) - set(g0.nodes)
    removed = set(g0.nodes) - set(g1.nodes)
    modified = {n for n in set(g0.nodes) & set(g1.nodes) if _modified(g0, g1, n)}
    return added, removed, modified


def align(ref_added: set, pred_added: set, gstar: Graph, gpred: Graph) -> dict[str, str]:
    """Greedy one-to-one map from predicted new nodes to reference new nodes."""
    cands = []
    for p in pred_added:
        for r in ref_added:
            s = (5.0 if gpred.nodes[p].is_a() == gstar.nodes[r].is_a() else 0.0)
            s += 5.0 / (1.0 + float(np.linalg.norm(gpred.origin(p) - gstar.origin(r))))
            if s >= MIN_MATCH_SCORE:
                cands.append((s, p, r))
    mapping, used = {}, set()
    for s, p, r in sorted(cands, reverse=True):
        if p not in mapping and r not in used:
            mapping[p] = r
            used.add(r)
    return mapping


def _prf(pred: set, ref: set) -> tuple[float, float, float]:
    if not pred and not ref:
        return 1.0, 1.0, 1.0
    tp = len(pred & ref)
    p = tp / len(pred) if pred else 0.0
    r = tp / len(ref) if ref else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def score(m0, mstar, mpred) -> tuple[float, dict]:
    g0, gs, gp = Graph(m0), Graph(mstar), Graph(mpred)
    ra, rr, rm = node_delta(g0, gs)
    pa, pr, pm = node_delta(g0, gp)
    mapping = align(ra, pa, gs, gp)
    ren = lambda n: mapping.get(n, n)
    ref_nodes = ra | rr | rm
    pred_nodes = {ren(n) for n in pa | pr | pm}
    ref_edges = g0.edges ^ gs.edges
    pred_edges = {(k, ren(a), ren(b)) for (k, a, b) in (g0.edges ^ gp.edges)}
    if not ref_nodes and not ref_edges:
        v = 1.0 if not pred_nodes and not pred_edges else 0.0
        rules = dict.fromkeys(["delta_node_precision", "delta_node_recall", "delta_node_f1", "delta_edge_precision",
                               "delta_edge_recall", "delta_edge_f1", "delta_topology_score"], v)
    else:
        np_, nr, nf = _prf(pred_nodes, ref_nodes)
        ep, er, ef = _prf(pred_edges, ref_edges)
        rules = {"delta_node_precision": np_, "delta_node_recall": nr, "delta_node_f1": nf,
                 "delta_edge_precision": ep, "delta_edge_recall": er, "delta_edge_f1": ef,
                 "delta_topology_score": LAMBDA_NODE * nf + (1 - LAMBDA_NODE) * ef}
    details = {"rules": rules, "n_ref_nodes": len(ref_nodes), "n_pred_nodes": len(pred_nodes),
               "n_ref_edges": len(ref_edges), "n_pred_edges": len(pred_edges), "aligned": len(mapping)}
    return rules, details


RULES = ("delta_node_precision", "delta_node_recall", "delta_node_f1", "delta_edge_precision",
         "delta_edge_recall", "delta_edge_f1", "delta_topology_score")


def _rules(pred_nodes, ref_nodes, pred_edges, ref_edges) -> dict:
    if not ref_nodes and not ref_edges:
        v = 1.0 if not pred_nodes and not pred_edges else 0.0
        return dict.fromkeys(RULES, v)
    np_, nr, nf = _prf(pred_nodes, ref_nodes)
    ep, er, ef = _prf(pred_edges, ref_edges)
    return {"delta_node_precision": np_, "delta_node_recall": nr, "delta_node_f1": nf, "delta_edge_precision": ep,
            "delta_edge_recall": er, "delta_edge_f1": ef, "delta_topology_score": LAMBDA_NODE * nf + (1 - LAMBDA_NODE) * ef}


def score_pairs(m0, mstar, mpred, op: str, pairs: list[tuple[str, str | None]], pred_pool: list[str]) -> tuple[list[dict], dict]:
    """Released evaluator: topology per reference entity, restricted to that entity.

    For each (reference id, matched predicted id) pair, the node sets hold the entity
    itself when it changed, and the edge sets hold the changed relations touching it.
    An unmatched reference entity scores 0 on every rule. For deletes the predicted side
    is the set of removed entities of the task's class (pred_pool)."""
    g0, gs, gp = Graph(m0), Graph(mstar), Graph(mpred)
    ra, rr, rm = node_delta(g0, gs)
    pa, pr, pm = node_delta(g0, gp)
    ref_delta_nodes, pred_delta_nodes = ra | rr | rm, pa | pr | pm
    ref_edges_all, pred_edges_all = g0.edges ^ gs.edges, g0.edges ^ gp.edges
    out = []
    for ref, cand in pairs:
        if op == "delete":
            watch = set(pred_pool) | {ref}
            ren = lambda n: n
        else:
            if cand is None:
                out.append(dict.fromkeys(RULES, 0.0))
                continue
            watch = {cand}
            ren = lambda n, c=cand, r=ref: r if n == c else n
        ref_nodes = {ref} & ref_delta_nodes
        pred_nodes = {ren(n) for n in pred_delta_nodes & watch}
        ref_edges = {e for e in ref_edges_all if ref in e[1:]}
        pred_edges = {(k, ren(a), ren(b)) for (k, a, b) in pred_edges_all if a in watch or b in watch}
        out.append(_rules(pred_nodes, ref_nodes, pred_edges, ref_edges))
    return out, {"n_ref_edges": len(ref_edges_all), "n_pred_edges": len(pred_edges_all)}
