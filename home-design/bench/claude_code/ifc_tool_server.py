"""MCP server exposing one tool, execute_ifc_code, to a headless Claude Code run.

    python -m bench.claude_code.ifc_tool_server --ifc model.ifc --mode read --budget 20 --log calls.jsonl
    python -m bench.claude_code.ifc_tool_server --ifc in.ifc --mode edit --save out.ifc --budget 20 --log calls.jsonl

The server owns the call budget: once it is spent, calls are refused with a message
asking for a final answer. In edit mode the edited model is saved to --save when
Claude Code closes the server (stdin EOF or SIGTERM), or after every call with
--save-every-call.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import time

from mcp.server.mcpserver import MCPServer

from bench.common.agent import BUDGET_MESSAGE
from bench.common.sandbox import IfcSandbox

READ_DESCRIPTION = (
    "Execute Python code against the loaded IFC model. The opened model is available as `ifc` "
    "(an ifcopenshell.file) and the `ifcopenshell` module is imported. Use print() to see results. "
    "Each call starts with a fresh namespace. The model is read-only: writing files is blocked."
)
EDIT_DESCRIPTION = (
    "Execute Python code against the loaded IFC model. The opened model is available as `ifc` "
    "(an ifcopenshell.file) and the `ifcopenshell` module is imported. Use print() to see results. "
    "Each call starts with a fresh namespace, but changes you make to `ifc` persist between calls "
    "and are saved automatically; do not write files yourself."
)


def build(args) -> tuple[MCPServer, IfcSandbox]:
    sandbox = IfcSandbox(args.ifc, timeout_s=args.timeout, mode=args.mode)
    state = {"calls": 0}
    server = MCPServer(name="ifc")

    def log(rec: dict) -> None:
        with open(args.log, "a") as f:
            f.write(json.dumps(rec) + "\n")

    @server.tool(name="execute_ifc_code",
                 description=EDIT_DESCRIPTION if args.mode == "edit" else READ_DESCRIPTION)
    def execute_ifc_code(code: str) -> str:
        if state["calls"] >= args.budget:
            log({"t": time.time(), "refused": True})
            return BUDGET_MESSAGE
        state["calls"] += 1
        t0 = time.time()
        ok, out = sandbox.run(code)
        saved = sandbox.save(args.save) if args.mode == "edit" and args.save and args.save_every_call else None
        log({"t": t0, "n": state["calls"], "ok": ok, "seconds": round(time.time() - t0, 2),
             "saved": saved, "code": code, "output": out[:4000]})
        return out if ok else f"ERROR:\n{out}"

    return server, sandbox


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ifc", required=True)
    ap.add_argument("--mode", choices=["read", "edit"], default="read")
    ap.add_argument("--save")
    ap.add_argument("--budget", type=int, default=20)
    ap.add_argument("--timeout", type=float, default=420.0)
    ap.add_argument("--log", required=True)
    ap.add_argument("--save-every-call", action="store_true")
    args = ap.parse_args(argv)
    server, sandbox = build(args)
    finished = {"done": False}

    def finish(*_):
        if finished["done"]:
            return
        finished["done"] = True
        if args.mode == "edit" and args.save:
            ok = sandbox.save(args.save)
            with open(args.log, "a") as f:
                f.write(json.dumps({"t": time.time(), "final_save": ok}) + "\n")
        sandbox.close()

    def on_term(*_):
        finish()
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_term)
    try:
        server.run("stdio")
    finally:
        finish()


if __name__ == "__main__":
    main()
