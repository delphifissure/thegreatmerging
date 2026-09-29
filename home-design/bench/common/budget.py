"""Spend ledger with a hard cap.

Every paid action appends one line to bench/spend.jsonl. Work that would push
the recorded total past the cap in bench/budget.json is refused before it starts.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parents[1]
BUDGET_FILE = BENCH_DIR / "budget.json"
SPEND_FILE = BENCH_DIR / "spend.jsonl"

# USD per million tokens: input, output, cache write (5 min), cache read.
# Source: Anthropic pricing table as of 2026-09-25.
ANTHROPIC_PRICES: dict[str, tuple[float, float, float, float]] = {
    "claude-opus-5-5": (4.00, 20.00, 5.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 2.50, 0.20),
    "claude-haiku-4-5": (1.00, 5.00, 1.25, 0.10),
    "claude-sonnet-4-6": (3.00, 15.00, 3.75, 0.30),
}


class BudgetExceeded(RuntimeError):
    pass


@dataclass
class Budget:
    cap_usd: float
    spend_file: Path = SPEND_FILE

    @classmethod
    def load(cls, budget_file: Path = BUDGET_FILE, spend_file: Path = SPEND_FILE) -> "Budget":
        return cls(cap_usd=float(json.loads(budget_file.read_text())["cap_usd"]), spend_file=spend_file)

    def spent(self) -> float:
        if not self.spend_file.exists():
            return 0.0
        total = 0.0
        for line in self.spend_file.read_text().splitlines():
            if line.strip():
                total += float(json.loads(line)["usd"])
        return total

    def remaining(self) -> float:
        return self.cap_usd - self.spent()

    def require(self, estimate_usd: float, what: str) -> None:
        """Refuse to start `what` if its estimate would pass the cap."""
        if estimate_usd > self.remaining():
            raise BudgetExceeded(
                f"{what}: estimate ${estimate_usd:.2f} exceeds remaining ${self.remaining():.2f} "
                f"of the ${self.cap_usd:.2f} cap"
            )

    def record(self, usd: float, kind: str, run_id: str, detail: dict | None = None) -> None:
        self.spend_file.parent.mkdir(parents=True, exist_ok=True)
        with self.spend_file.open("a") as f:
            f.write(json.dumps({"ts": time.time(), "kind": kind, "run_id": run_id,
                                "usd": round(usd, 6), "detail": detail or {}}) + "\n")


def anthropic_cost(model: str, usage: dict) -> float:
    """Cost of one Messages API response from its usage block."""
    p_in, p_out, p_cw, p_cr = ANTHROPIC_PRICES[model]
    return (
        usage.get("input_tokens", 0) * p_in
        + usage.get("output_tokens", 0) * p_out
        + (usage.get("cache_creation_input_tokens") or 0) * p_cw
        + (usage.get("cache_read_input_tokens") or 0) * p_cr
    ) / 1e6
