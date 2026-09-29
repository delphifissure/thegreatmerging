"""Fixed tool-use loop with a hard call budget and a stop condition.

The loop stops when the model answers without calling a tool, when the tool-call
budget is spent, or when the per-task dollar budget is spent. There is no
orchestration by the model beyond choosing the code it sends to the one tool.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field

from .llm import ToolSpec
from .sandbox import IfcSandbox

EXECUTE_TOOL = ToolSpec(
    name="execute_ifc_code",
    description=(
        "Execute Python code against the loaded IFC model. The opened model is available as `ifc` "
        "(an ifcopenshell.file) and the `ifcopenshell` module is imported. Use print() to see results. "
        "Each call starts with a fresh namespace. The model is read-only: writing files is blocked."
    ),
    parameters={
        "type": "object",
        "properties": {"code": {"type": "string", "description": "Python code to execute"}},
        "required": ["code"],
        "additionalProperties": False,
    },
)


BUDGET_MESSAGE = ("Tool-call budget exhausted; this call was not executed. "
                  "Give your final answer now, without calling any tool.")


@dataclass
class AgentResult:
    answer: str
    stop: str  # "answered" | "answered_after_budget" | "call_budget" | "usd_budget" | "error"
    tool_calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    seconds: float
    transcript: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def run_agent(chat, sandbox: IfcSandbox, user_prompt: str, max_tool_calls: int = 20,
              max_usd: float | None = None) -> AgentResult:
    t0 = time.time()
    chat.add_user(user_prompt)
    calls = 0
    tin = tout = 0
    cost = 0.0
    transcript: list = []
    last_text = ""
    final_turn_used = False
    while True:
        try:
            turn = chat.step()
        except Exception as e:  # provider error ends the task; recorded, not retried here
            return AgentResult(last_text, "error", calls, tin, tout, cost, time.time() - t0,
                               transcript + [{"error": repr(e)}])
        tin += turn.usage.get("input_tokens", 0) + (turn.usage.get("cache_read_input_tokens") or 0) \
            + (turn.usage.get("cache_creation_input_tokens") or 0)
        tout += turn.usage.get("output_tokens", 0)
        cost += turn.cost_usd
        if turn.text:
            last_text = turn.text
        transcript.append({"text": turn.text, "calls": [(c.name, c.args) for c in turn.tool_calls],
                           "usage": turn.usage, "stop_reason": turn.stop_reason})
        if not turn.tool_calls:
            stop = "answered_after_budget" if final_turn_used else "answered"
            return AgentResult(turn.text, stop, calls, tin, tout, cost, time.time() - t0, transcript)
        if calls + len(turn.tool_calls) > max_tool_calls:
            if final_turn_used:
                return AgentResult(last_text, "call_budget", calls, tin, tout, cost, time.time() - t0, transcript)
            # Stop condition: refuse the calls and ask once for a final answer.
            final_turn_used = True
            chat.add_tool_results([(c.id, BUDGET_MESSAGE, False) for c in turn.tool_calls])
            continue
        if max_usd is not None and cost >= max_usd:
            return AgentResult(last_text, "usd_budget", calls, tin, tout, cost, time.time() - t0, transcript)
        results = []
        for c in turn.tool_calls:
            calls += 1
            if c.name != EXECUTE_TOOL.name or not isinstance(c.args.get("code"), str):
                results.append((c.id, f"Unknown tool or missing 'code' argument: {c.name}", False))
                continue
            ok, out = sandbox.run(c.args["code"])
            transcript[-1].setdefault("results", []).append({"ok": ok, "output": out[:4000]})
            results.append((c.id, out, ok))
        chat.add_tool_results(results)
