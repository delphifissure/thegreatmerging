"""Run one headless Claude Code task (`claude -p`) under the user's Claude plan.

No Anthropic API key is used: the CLI authenticates with the logged-in account, so
usage counts against the plan's limits, not an API bill. The run is isolated so the
harness is only what we pass in:
- `--system-prompt` replaces Claude Code's own system prompt,
- `--tools ""` removes every built-in tool (Bash, Read, Edit, web, ...),
- `--strict-mcp-config` loads only the MCP servers we pass,
- `--setting-sources project` in an empty temp directory loads no user settings or CLAUDE.md,
- `--no-session-persistence` keeps benchmark runs out of the session history.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL_NAME = "mcp__ifc__execute_ifc_code"
LIMIT_PATTERN = re.compile(r"usage limit|rate limit|limit reached|quota|overloaded|429|resets? at", re.I)
# Variables that would make a nested run pick up this repository's CLAUDE.md files.
STRIP_ENV = ("CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD",)


@dataclass
class ClaudeRun:
    text: str
    ok: bool
    rate_limited: bool
    subtype: str
    num_turns: int
    seconds: float
    usage: dict = field(default_factory=dict)
    notional_usd: float = 0.0  # list-price equivalent Claude Code reports; not billed on a plan
    models: list[str] = field(default_factory=list)
    structured: dict | None = None
    stderr: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def mcp_config(ifc: str, mode: str, budget: int, log: str, save: str | None = None) -> dict:
    args = ["-m", "bench.claude_code.ifc_tool_server", "--ifc", ifc, "--mode", mode,
            "--budget", str(budget), "--log", log]
    if save:
        args += ["--save", save]
    return {"mcpServers": {"ifc": {"type": "stdio", "command": sys.executable, "args": args,
                                   "env": {"PYTHONPATH": str(ROOT)}}}}


def run_claude(prompt: str, system: str, model: str, *, mcp: dict | None = None,
               effort: str | None = None, json_schema: dict | None = None,
               timeout_s: int = 1800, claude_bin: str = "claude") -> ClaudeRun:
    with tempfile.TemporaryDirectory(prefix="cc-task-") as cwd:
        cmd = [claude_bin, "-p", prompt, "--output-format", "json", "--model", model,
               "--system-prompt", system, "--tools", "", "--strict-mcp-config",
               "--setting-sources", "project", "--no-session-persistence", "--disable-slash-commands"]
        if mcp:
            cfg = Path(cwd) / "mcp.json"
            cfg.write_text(json.dumps(mcp))
            cmd += ["--mcp-config", str(cfg), "--allowedTools", TOOL_NAME]
        if effort:
            cmd += ["--effort", effort]
        if json_schema:
            cmd += ["--json-schema", json.dumps(json_schema)]
        env = {k: v for k, v in os.environ.items() if k not in STRIP_ENV}
        t0 = time.time()
        try:
            proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout_s)
        except subprocess.TimeoutExpired as e:
            return ClaudeRun("", False, False, "timeout", 0, time.time() - t0, stderr=str(e)[:2000])
    return parse(proc.stdout, proc.stderr, proc.returncode, time.time() - t0)


def parse(stdout: str, stderr: str, returncode: int, seconds: float) -> ClaudeRun:
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        text = (stdout + "\n" + stderr).strip()
        return ClaudeRun(text[:4000], False, bool(LIMIT_PATTERN.search(text)), "no_json", 0, seconds,
                         stderr=stderr[-2000:])
    text = data.get("result") or ""
    is_error = bool(data.get("is_error")) or returncode != 0
    structured = data.get("structured_output")
    if structured is None and text:
        try:
            maybe = json.loads(text)
            structured = maybe if isinstance(maybe, dict) else None
        except json.JSONDecodeError:
            pass
    return ClaudeRun(
        text=text, ok=not is_error,
        rate_limited=is_error and bool(LIMIT_PATTERN.search(text + " " + stderr)),
        subtype=data.get("subtype", ""), num_turns=int(data.get("num_turns") or 0), seconds=seconds,
        usage=data.get("usage") or {}, notional_usd=float(data.get("total_cost_usd") or 0.0),
        models=list((data.get("modelUsage") or {}).keys()), structured=structured, stderr=stderr[-2000:],
    )


def wait_out_limit(first_seen: float, wait_s: int, give_up_after_s: int) -> bool:
    """Sleep before retrying after a usage-limit hit. False once we have waited too long."""
    if time.time() - first_seen > give_up_after_s:
        return False
    time.sleep(wait_s)
    return True
