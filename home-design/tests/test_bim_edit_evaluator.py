"""Rebuilt BIM-Edit scorer on tiny hand-built models."""

import numpy as np
import ifcopenshell
import ifcopenshell.api
import pytest

from bench.bim_edit.evaluator import evaluate as ev
from bench.bim_edit.evaluator import geometry, semantics


def base_model():
    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    project = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcProject", name="P")
    ifcopenshell.api.run("unit.assign_unit", f)
    ctx = ifcopenshell.api.run("context.add_context", f, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                                target_view="MODEL_VIEW", parent=ctx)
    site = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSite", name="S")
    bldg = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuilding", name="B")
    storey = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="L0")
    ifcopenshell.api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[bldg], relating_object=site)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[storey], relating_object=bldg)
    return f, body, storey


def add_column(f, body, storey, x, guid=None, name="C1"):
    col = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcColumn", name=name)
    if guid:
        col.GlobalId = guid
    m = np.eye(4)
    m[0, 3] = x
    ifcopenshell.api.run("geometry.edit_object_placement", f, product=col, matrix=m)
    rep = ifcopenshell.api.run("geometry.add_profile_representation", f, context=body,
                               profile=f.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=0.3, YDim=0.3),
                               depth=3.0)
    ifcopenshell.api.run("geometry.assign_representation", f, product=col, representation=rep)
    ifcopenshell.api.run("spatial.assign_container", f, products=[col], relating_structure=storey)
    return col


def test_geometry_identical_and_shifted():
    f, body, storey = base_model()
    a = add_column(f, body, storey, 0.0)
    b = add_column(f, body, storey, 0.0, name="C2")
    c = add_column(f, body, storey, 2.0, name="C3")
    ta, tb, tc = geometry.triangles(a), geometry.triangles(b), geometry.triangles(c)
    assert geometry.score([ta], [tb])[0] == pytest.approx(1.0)
    assert geometry.score([ta], [tc])[0] < 0.2
    assert geometry.score([ta], [])[0] == 0.0 and geometry.score([], [])[0] == 1.0
    assert geometry.obb_iou(geometry.obb(ta), geometry.obb(tb)) == pytest.approx(1.0)
    assert geometry.obb_iou(geometry.obb(ta), geometry.obb(tc)) == 0.0


def test_properties_ignore_tag_description_and_use_tolerance():
    f, body, storey = base_model()
    a = add_column(f, body, storey, 0.0)
    b = add_column(f, body, storey, 0.0)
    for e, h in ((a, 3.0), (b, 3.1)):
        pset = ifcopenshell.api.run("pset.add_pset", f, product=e, name="Pset_ColumnCommon")
        ifcopenshell.api.run("pset.edit_pset", f, pset=pset, properties={"Reference": "R1", "Description": "x" + str(h)})
    b.Tag = "different"
    b.Description = "different"
    score, d = semantics.property_score(a, b)
    assert score == 1.0 and "Pset_ColumnCommon.Description" not in d["passed"]
    assert semantics._equal(3.0, 3.1) and not semantics._equal(3.0, 3.5)


def test_create_task_scores_a_matching_column(monkeypatch):
    m0, body, storey = base_model()
    ms = ifcopenshell.file.from_string(m0.to_string())
    mp = ifcopenshell.file.from_string(m0.to_string())
    for m in (ms, mp):
        st = m.by_type("IfcBuildingStorey")[0]
        b = m.by_type("IfcGeometricRepresentationSubContext")[0]
        add_column(m, b, st, 1.0)
    r = ev.evaluate("COL-CRE-DIR-A-999", m0, ms, mp)
    assert r["geometry"] == pytest.approx(1.0) and r["semantics"] == pytest.approx(1.0)
    assert r["topology_breakdown"]["delta_edge_f1"] == pytest.approx(1.0)
    assert r["final_score"] == pytest.approx(1.0)
    empty = ev.evaluate("COL-CRE-DIR-A-999", m0, ms, m0)
    assert empty["final_score"] == 0.0


def test_delete_semantics_released_bug_vs_paper(monkeypatch):
    m0, body, storey = base_model()
    col = add_column(m0, body, storey, 1.0, guid="0000000000000000000001")
    ms = ifcopenshell.file.from_string(m0.to_string())
    ifcopenshell.api.run("root.remove_product", ms, product=ms.by_guid(col.GlobalId))
    monkeypatch.setitem(ev.PINS, "COL-DEL-DIR-A-999", {"pinned_guid": col.GlobalId, "pin_status": "ok"})
    deleted = ev.evaluate("COL-DEL-DIR-A-999", m0, ms, ms, mode="released")
    kept = ev.evaluate("COL-DEL-DIR-A-999", m0, ms, m0, mode="released")
    # Released evaluator: a correct delete gets semantics 0, a skipped delete gets 1.
    assert deleted["semantics"] == 0.0 and kept["semantics"] == 1.0
    # Paper text: semantics is 1 when the target was removed.
    assert ev.evaluate("COL-DEL-DIR-A-999", m0, ms, ms, mode="paper")["semantics"] == 1.0
    assert ev.evaluate("COL-DEL-DIR-A-999", m0, ms, m0, mode="paper")["semantics"] == 0.0
    assert deleted["geometry"] == pytest.approx(1.0)
