import pytest

from bench.ifc_bench.score import score, wilson


def test_partial_counts_as_wrong():
    judged = [{"id": 1, "category": 1, "label": "correct"},
              {"id": 2, "category": 1, "label": "partial"},
              {"id": 3, "category": 2, "label": "incorrect"}]
    answers = [{"id": i, "seconds": 1, "tool_calls": 2, "input_tokens": 3, "output_tokens": 4,
                "cost_usd": 0.0, "stop": "answered"} for i in (1, 2, 3)]
    s = score(judged, answers)
    assert s["all"]["accuracy_strict"] == pytest.approx(1 / 3)
    assert s["all"]["accuracy_partial_as_correct"] == pytest.approx(2 / 3)
    assert s["cat1"]["n"] == 2


def test_wilson_bounds():
    lo, hi = wilson(50, 100)
    assert 0.40 < lo < 0.41 and 0.59 < hi < 0.60


@pytest.mark.network
def test_fixed_split_matches_published_counts():
    from bench.ifc_bench.data import test_split

    qs = test_split()
    assert len(qs) == 514
