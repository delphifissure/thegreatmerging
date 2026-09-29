import json

from bench.bim_edit.tasks import load
from bench.claude_code.cli import TOOL_NAME, mcp_config, parse
from bench.claude_code.common import record
from bench.claude_code.loop import load_done, run_items
from bench.claude_code.run_bim_edit import PAPER_SYSTEM_PROMPT, stratified


def test_parse_success_and_structured_output():
    out = json.dumps({"result": '{"label": "correct", "reason": "ok"}', "is_error": False, "subtype": "success",
                      "num_turns": 1, "total_cost_usd": 0.01, "usage": {"input_tokens": 5, "output_tokens": 2},
                      "modelUsage": {"claude-opus-5-5": {}}})
    r = parse(out, "", 0, 1.5)
    assert r.ok and not r.rate_limited and r.structured == {"label": "correct", "reason": "ok"}
    assert r.models == ["claude-opus-5-5"] and r.notional_usd == 0.01


def test_parse_detects_usage_limit():
    out = json.dumps({"result": "Claude usage limit reached. Your limit resets at 5pm.", "is_error": True})
    r = parse(out, "", 1, 0.2)
    assert not r.ok and r.rate_limited


def test_parse_non_json_error():
    r = parse("", "Error: something broke", 1, 0.1)
    assert not r.ok and not r.rate_limited and r.subtype == "no_json"


def test_record_counts_calls_and_budget_refusal(tmp_path):
    log = tmp_path / "log.jsonl"
    log.write_text("\n".join(json.dumps(x) for x in [{"n": 1, "ok": True}, {"n": 2, "ok": True}, {"refused": True}]))
    r = parse(json.dumps({"result": "done", "is_error": False, "subtype": "success"}), "", 0, 3.0)
    rec = record(r, log)
    assert rec["tool_calls"] == 2 and rec["stop"] == "answered_after_budget" and rec["cost_usd"] == 0.0


def test_mcp_config_names_the_tool_server():
    cfg = mcp_config("/x.ifc", "edit", 20, "/log", save="/out.ifc")["mcpServers"]["ifc"]
    assert cfg["args"][:2] == ["-m", "bench.claude_code.ifc_tool_server"] and "--save" in cfg["args"]
    assert TOOL_NAME == "mcp__ifc__execute_ifc_code"


def test_stratified_subset_covers_every_cell():
    s = stratified(load(), 1)
    assert len(s) == 18
    assert len({(t["operation"], t["category"], t["scene"]) for t in s}) == 18


def test_paper_prompt_is_verbatim_start():
    assert PAPER_SYSTEM_PROMPT.startswith("You are a BIM assistant, with a deep knowledge")


def test_loop_resumes_and_retries_rate_limits(tmp_path):
    out = tmp_path / "out.jsonl"
    out.write_text(json.dumps({"k": 1, "stop": "answered"}) + "\n" + json.dumps({"k": 2, "stop": "error"}) + "\n")
    done = load_done(out, "k")
    assert done == {1}
    attempts = {"n": 0}

    def work(k):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return {"k": k, "stop": "rate_limited"}
        return {"k": k, "stop": "answered", "seconds": 0}

    run_items([2], lambda k: k, work, out, workers=1, limit_wait_s=0)
    assert load_done(out, "k") == {1, 2} and attempts["n"] == 2
