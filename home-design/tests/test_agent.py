from bench.common.agent import BUDGET_MESSAGE, run_agent
from bench.common.llm import ToolCall, Turn
from bench.common.sandbox import IfcSandbox


class FakeChat:
    """Scripted model: a list of turns, each either code to run or a final answer."""

    def __init__(self, script):
        self.script = list(script)
        self.results = []

    def add_user(self, text):
        pass

    def add_tool_results(self, results):
        self.results.append(results)

    def step(self):
        item = self.script.pop(0)
        usage = {"input_tokens": 10, "output_tokens": 5}
        if isinstance(item, list):
            calls = [ToolCall(f"c{i}", "execute_ifc_code", {"code": c}) for i, c in enumerate(item)]
            return Turn("", calls, usage, 0.01, "tool_use")
        return Turn(item, [], usage, 0.01, "end_turn")


def test_answers_after_tool_use(tiny_ifc):
    chat = FakeChat([["print(len(ifc.by_type('IfcWall')))"], "There are 2 walls."])
    with IfcSandbox(tiny_ifc) as sb:
        res = run_agent(chat, sb, "How many walls?")
    assert res.stop == "answered" and res.answer == "There are 2 walls."
    assert res.tool_calls == 1 and chat.results[0][0][1].strip() == "2"
    assert abs(res.cost_usd - 0.02) < 1e-9


def test_call_budget_asks_for_final_answer(tiny_ifc):
    chat = FakeChat([["print(1)"]] * 3 + ["Final."])
    with IfcSandbox(tiny_ifc) as sb:
        res = run_agent(chat, sb, "q", max_tool_calls=2)
    assert res.stop == "answered_after_budget" and res.answer == "Final." and res.tool_calls == 2
    assert chat.results[-1][0][1] == BUDGET_MESSAGE


def test_call_budget_stops_if_model_keeps_calling(tiny_ifc):
    chat = FakeChat([["print(1)"]] * 5)
    with IfcSandbox(tiny_ifc) as sb:
        res = run_agent(chat, sb, "q", max_tool_calls=2)
    assert res.stop == "call_budget" and res.tool_calls == 2


def test_usd_budget_stops(tiny_ifc):
    chat = FakeChat([["print(1)"]] * 5)
    with IfcSandbox(tiny_ifc) as sb:
        res = run_agent(chat, sb, "q", max_tool_calls=20, max_usd=0.02)
    assert res.stop == "usd_budget"
