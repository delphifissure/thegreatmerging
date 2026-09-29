import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def tiny_ifc(tmp_path_factory) -> Path:
    """A one-storey IFC4 file with two walls, built with ifcopenshell.api."""
    import ifcopenshell
    import ifcopenshell.api

    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    project = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcProject", name="Test")
    ifcopenshell.api.run("unit.assign_unit", f)
    site = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuilding", name="House")
    storey = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Ground")
    ifcopenshell.api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[building], relating_object=site)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[storey], relating_object=building)
    for name in ("W1", "W2"):
        w = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcWall", name=name)
        ifcopenshell.api.run("spatial.assign_container", f, products=[w], relating_structure=storey)
    path = tmp_path_factory.mktemp("ifc") / "tiny.ifc"
    f.write(str(path))
    return path
