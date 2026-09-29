"""Rebuild BIM-Edit's 324 task definitions from the authors' published run cache.

The harness code (and its data/tasks.jsonl) is linked from the paper on arXiv, which
this environment cannot reach. Every published run caches each task's prompt,
operation, category and input and ground-truth file names, and every named file is
in huggingface.co/datasets/BIM-Edit/BIM-Edit (complex/ for realistic scenes, simple/
for artificial ones). The rebuilt list is committed as bench/bim_edit/tasks.jsonl
and checked against the official file once the harness repository is reachable.

    python -m bench.bim_edit.tasks
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path, PureWindowsPath

from bench.common.hf import download

from .published import DATA_DIR, RUNS_REPO

DATA_REPO = "BIM-Edit/BIM-Edit"
TASKS_FILE = Path(__file__).resolve().parent / "tasks.jsonl"
SOURCE_RUN = ("claude-sonnet", "cache_claude-sonnet-4-6.json")


def rebuild() -> list[dict]:
    folder, name = SOURCE_RUN
    cache = json.loads(download(RUNS_REPO, f"{folder}/{name}", DATA_DIR / folder / name).read_text())
    tasks = []
    for tid, v in sorted(cache.items()):
        inp = PureWindowsPath(v["input_ifc"])
        gt = PureWindowsPath(v["ground_truth_ifc"])
        sub = "complex" if inp.parent.name == "realistic" else "simple"
        tasks.append({
            "task_id": tid, "prompt": v["prompt"], "operation": v["operation"], "category": v["category"],
            "scene": "realistic" if sub == "complex" else "artificial",
            "input_ifc": f"{sub}/{inp.name}", "ground_truth_ifc": f"{sub}/{gt.name}",
        })
    return tasks


def load() -> list[dict]:
    return [json.loads(l) for l in TASKS_FILE.read_text().splitlines() if l.strip()]


def main() -> None:
    tasks = rebuild()
    TASKS_FILE.write_text("".join(json.dumps(t) + "\n" for t in tasks))
    print(len(tasks), Counter(t["operation"] for t in tasks), Counter(t["category"] for t in tasks),
          Counter(t["scene"] for t in tasks))


if __name__ == "__main__":
    main()
