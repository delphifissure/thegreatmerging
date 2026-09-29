"""Shared helpers: read an MCP call log and turn a ClaudeRun into a result record."""

from __future__ import annotations

import json
from pathlib import Path

from .cli import ClaudeRun


def read_log(log: Path) -> list[dict]:
    if not log.exists():
        return []
    return [json.loads(l) for l in log.read_text().splitlines() if l.strip()]


def record(run: ClaudeRun, log: Path) -> dict:
    calls = [r for r in read_log(log) if "n" in r]
    refused = any(r.get("refused") for r in read_log(log))
    if run.rate_limited:
        stop = "rate_limited"
    elif run.subtype == "timeout":
        stop = "timeout"
    elif not run.ok:
        stop = "error"
    else:
        stop = "answered_after_budget" if refused else "answered"
    u = run.usage or {}
    return {
        "answer": run.text, "stop": stop, "tool_calls": len(calls), "seconds": run.seconds,
        "num_turns": run.num_turns,
        "input_tokens": (u.get("input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0)
        + (u.get("cache_creation_input_tokens") or 0),
        "output_tokens": u.get("output_tokens") or 0,
        "cost_usd": 0.0,  # billed to the Claude plan, not the API
        "notional_usd": run.notional_usd, "models": run.models, "subtype": run.subtype,
        "stderr": run.stderr[-500:] if not run.ok else "",
    }
