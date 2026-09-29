import json

import pytest

from bench.common.budget import Budget, BudgetExceeded, anthropic_cost


def test_cap_is_enforced(tmp_path):
    bf = tmp_path / "budget.json"
    bf.write_text(json.dumps({"cap_usd": 10}))
    b = Budget.load(bf, tmp_path / "spend.jsonl")
    b.record(7.5, "runpod", "r1")
    assert b.remaining() == pytest.approx(2.5)
    b.require(2.0, "ok")
    with pytest.raises(BudgetExceeded):
        b.require(3.0, "too much")


def test_repo_cap_is_fifty_dollars():
    assert Budget.load().cap_usd == 50.0


def test_anthropic_cost_counts_cache_tokens():
    usage = {"input_tokens": 1_000_000, "output_tokens": 100_000,
             "cache_creation_input_tokens": 0, "cache_read_input_tokens": 1_000_000}
    assert anthropic_cost("claude-opus-5-5", usage) == pytest.approx(4.0 + 2.0 + 0.2)
