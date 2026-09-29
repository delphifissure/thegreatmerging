"""Surface sampling and the pooled median Chamfer geometry score (paper eq. 2, appendix E.1)."""

from __future__ import annotations

import numpy as np
import ifcopenshell
import ifcopenshell.geom
from scipy.spatial import cKDTree

PER_OBJECT = 4096
MIN_PER_OBJECT = 256
TOTAL = 16384
ALPHA = 5.0

_settings = ifcopenshell.geom.settings()
_settings.set("use-world-coords", True)
_local = ifcopenshell.geom.settings()


def triangles(entity, world: bool = True) -> np.ndarray | None:
    """Triangles (n, 3, 3) of an entity's body in world coordinates, or in the object's
    own placement frame with world=False. None if it has no body."""
    if not getattr(entity, "Representation", None):
        return None
    try:
        shape = ifcopenshell.geom.create_shape(_settings if world else _local, entity)
    except Exception:
        return None
    v = np.asarray(shape.geometry.verts, dtype=float).reshape(-1, 3)
    f = np.asarray(shape.geometry.faces, dtype=int).reshape(-1, 3)
    if len(f) == 0:
        return None
    return v[f]


def area(tris: np.ndarray) -> np.ndarray:
    return np.linalg.norm(np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]), axis=1) / 2


def sample(tris: np.ndarray, n: int, seed: int = 0) -> np.ndarray:
    """Uniform surface samples; a fixed seed makes identical meshes give identical points."""
    a = area(tris)
    if a.sum() <= 0:
        return tris.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(tris), n, p=a / a.sum())
    r1 = np.sqrt(rng.random(n))
    r2 = rng.random(n)
    t = tris[idx]
    return (1 - r1)[:, None] * t[:, 0] + (r1 * (1 - r2))[:, None] * t[:, 1] + (r1 * r2)[:, None] * t[:, 2]


def pool_points(meshes: list[np.ndarray]) -> np.ndarray:
    """Pooled point cloud: per-object budget proportional to area, clamped to [256, 4096]."""
    meshes = [m for m in meshes if m is not None and len(m)]
    if not meshes:
        return np.empty((0, 3))
    areas = np.array([area(m).sum() for m in meshes])
    share = areas / areas.sum() if areas.sum() > 0 else np.full(len(meshes), 1 / len(meshes))
    counts = np.clip(np.round(share * TOTAL).astype(int), MIN_PER_OBJECT, PER_OBJECT)
    return np.vstack([sample(m, int(c)) for m, c in zip(meshes, counts)])


def median_chamfer(p: np.ndarray, q: np.ndarray) -> float:
    dpq = cKDTree(q).query(p)[0]
    dqp = cKDTree(p).query(q)[0]
    return float(np.median(np.concatenate([dpq, dqp])))


def score(gt_meshes: list, pred_meshes: list) -> tuple[float, dict]:
    p, q = pool_points(gt_meshes), pool_points(pred_meshes)
    if len(p) == 0 and len(q) == 0:
        return 1.0, {"skipped": "both_pools_empty"}
    if len(p) == 0 or len(q) == 0:
        return 0.0, {"skipped": "gt_pool_empty" if len(p) == 0 else "edited_pool_empty"}
    cd = median_chamfer(p, q)
    both = np.vstack([p, q])
    diag = float(np.linalg.norm(both.max(0) - both.min(0)))
    s = float(np.exp(-cd / diag * ALPHA)) if diag > 0 else (1.0 if cd == 0 else 0.0)
    return s, {"cd": cd, "bbox_diag": diag}


def obb(tris: np.ndarray | None):
    """Oriented box (center, axes rows, half extents) from the mesh vertices by PCA."""
    if tris is None:
        return None
    pts = tris.reshape(-1, 3)
    c = pts.mean(0)
    x = pts - c
    _, _, vt = np.linalg.svd(x, full_matrices=False) if len(pts) > 2 else (None, None, np.eye(3))
    proj = x @ vt.T
    lo, hi = proj.min(0), proj.max(0)
    center = c + ((lo + hi) / 2) @ vt
    return center, vt, np.maximum((hi - lo) / 2, 1e-6)


def _inside(points, box):
    center, axes, half = box
    local = (points - center) @ axes.T
    return np.all(np.abs(local) <= half + 1e-9, axis=1)


def obb_iou(a, b, grid: int = 64) -> float:
    """OBB IoU estimated on a grid over the joint bounding box of the two boxes."""
    if a is None or b is None:
        return 0.0
    corners = []
    for center, axes, half in (a, b):
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    corners.append(center + (np.array([sx, sy, sz]) * half) @ axes)
    corners = np.array(corners)
    lo, hi = corners.min(0), corners.max(0)
    axes_pts = [np.linspace(lo[i], hi[i], grid) for i in range(3)]
    g = np.stack(np.meshgrid(*axes_pts, indexing="ij"), -1).reshape(-1, 3)
    ia, ib = _inside(g, a), _inside(g, b)
    union = np.count_nonzero(ia | ib)
    return float(np.count_nonzero(ia & ib) / union) if union else 0.0
