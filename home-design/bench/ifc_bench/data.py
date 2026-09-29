"""IFC-Bench v2 with the fixed 514-question test split of Hellin et al. 2026.

Source: huggingface.co/datasets/sylvainHellin/ifc-bench (CC BY 4.0; IFC models
keep their own licences, four of them GPLv3). The dataset is pinned to the
revision below so every run scores the same questions.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from bench.common.hf import download

REPO = "sylvainHellin/ifc-bench"
REVISION = "main"  # replaced by the resolved sha in each run's manifest
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "ifc_bench"
EXPECTED_TEST_PER_CATEGORY = {1: 72, 2: 289, 3: 50, 4: 103}


@dataclass(frozen=True)
class Question:
    id: int
    question: str
    ground_truth: str
    project: str
    ifc_model: str
    category: int

    @property
    def ifc_rel_path(self) -> str:
        return f"projects/{self.project}/{self.ifc_model}.ifc"


def load_questions(data_dir: Path = DATA_DIR, revision: str = REVISION) -> list[Question]:
    qpath = download(REPO, "questions/ifc-bench-v2.csv", data_dir / "questions/ifc-bench-v2.csv", revision)
    with qpath.open(newline="") as f:
        return [Question(int(r["id"]), r["question"], r["ground_truth"], r["project"], r["ifc_model"],
                         int(r["category"])) for r in csv.DictReader(f)]


def load_split(data_dir: Path = DATA_DIR, revision: str = REVISION) -> dict[int, str]:
    spath = download(REPO, "questions/eval-split-hellin2026.csv",
                     data_dir / "questions/eval-split-hellin2026.csv", revision)
    with spath.open(newline="") as f:
        return {int(r["id"]): r["split"] for r in csv.DictReader(f)}


def test_split(data_dir: Path = DATA_DIR, revision: str = REVISION) -> list[Question]:
    """The 514 held-out questions, checked against the published per-category counts."""
    split = load_split(data_dir, revision)
    qs = [q for q in load_questions(data_dir, revision) if split.get(q.id) == "test"]
    counts = {c: sum(q.category == c for q in qs) for c in EXPECTED_TEST_PER_CATEGORY}
    if len(qs) != 514 or counts != EXPECTED_TEST_PER_CATEGORY:
        raise ValueError(f"test split mismatch: {len(qs)} questions, per category {counts}")
    return qs


def ifc_path(q: Question, data_dir: Path = DATA_DIR, revision: str = REVISION) -> Path:
    return download(REPO, q.ifc_rel_path, data_dir / q.ifc_rel_path, revision)
