from collections import Counter

from bench.bim_edit.tasks import load


def test_rebuilt_tasks_cover_the_benchmark():
    tasks = load()
    assert len(tasks) == 324 and len({t["task_id"] for t in tasks}) == 324
    assert Counter(t["operation"] for t in tasks) == {"create": 108, "update": 108, "delete": 108}
    assert Counter(t["category"] for t in tasks) == {"direct": 108, "spatial": 108, "topological": 108}
    assert Counter(t["scene"] for t in tasks) == {"realistic": 162, "artificial": 162}


def test_task_files_point_into_the_dataset_folders():
    for t in load():
        folder = "complex" if t["scene"] == "realistic" else "simple"
        assert t["input_ifc"].startswith(folder + "/") and t["ground_truth_ifc"].startswith(folder + "/")
        assert t["input_ifc"].endswith(".ifc") and t["prompt"].strip()
