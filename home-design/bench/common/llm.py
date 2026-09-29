"""Model adapters for the benchmark agents.

Two backends behind one small interface:
- AnthropicChat: Claude through the official Anthropic SDK.
- OpenAICompatChat: an open-weights model served by vLLM on RunPod, through its
  OpenAI-compatible endpoint.

Each adapter keeps its own message list in its provider's native format, so
histories are append-only and prompt caching works on the Claude side.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field

from .budget import anthropic_cost


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict


@dataclass
class Turn:
    text: str
    tool_calls: list[ToolCall]
    usage: dict
    cost_usd: float
    stop_reason: str


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict  # JSON Schema


class AnthropicChat:
    def __init__(self, model: str, system: str, tools: list[ToolSpec], effort: str | None = None,
                 max_tokens: int = 32000, client=None):
        import anthropic

        self.client = client or anthropic.Anthropic()
        self.model = model
        self.effort = effort
        self.max_tokens = max_tokens
        self.system = [{"type": "text", "text": system}]
        self.tools = [{"name": t.name, "description": t.description, "input_schema": t.parameters}
                      for t in tools]
        self.messages: list[dict] = []

    def add_user(self, text: str) -> None:
        self.messages.append({"role": "user", "content": text})

    def add_tool_results(self, results: list[tuple[str, str, bool]]) -> None:
        self.messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "content": out or "(no output)", "is_error": not ok}
            for tid, out, ok in results
        ]})

    def step(self) -> Turn:
        kwargs = dict(
            model=self.model, max_tokens=self.max_tokens, system=self.system,
            tools=self.tools, messages=self.messages,
            cache_control={"type": "ephemeral"},  # auto-cache the growing history
        )
        if self.effort:
            kwargs["output_config"] = {"effort": self.effort}
        with self.client.messages.stream(**kwargs) as stream:
            resp = stream.get_final_message()
        self.messages.append({"role": "assistant", "content": resp.content})
        usage = resp.usage.model_dump() if hasattr(resp.usage, "model_dump") else dict(resp.usage)
        text = "".join(b.text for b in resp.content if b.type == "text")
        calls = [ToolCall(b.id, b.name, b.input) for b in resp.content if b.type == "tool_use"]
        return Turn(text, calls, usage, anthropic_cost(self.model, usage), resp.stop_reason)


def curl_post_json(url: str, payload: dict, headers: dict[str, str], timeout_s: int = 900) -> dict:
    """POST JSON with curl, which uses the session's proxy and CA bundle as configured."""
    cmd = ["curl", "-sS", "--fail-with-body", "--max-time", str(timeout_s), "-X", "POST", url,
           "-H", "content-type: application/json", "--data-binary", "@-"]
    for k, v in headers.items():
        cmd += ["-H", f"{k}: {v}"]
    proc = subprocess.run(cmd, input=json.dumps(payload), capture_output=True, text=True,
                          timeout=timeout_s + 30)
    if proc.returncode != 0:
        raise RuntimeError(f"POST {url} failed ({proc.returncode}): {proc.stderr.strip()} {proc.stdout[:500]}")
    return json.loads(proc.stdout)


class OpenAICompatChat:
    """Chat against an OpenAI-compatible server (vLLM on RunPod). Cost is GPU time, billed separately."""

    def __init__(self, model: str, system: str, tools: list[ToolSpec], base_url: str,
                 api_key: str = "EMPTY", max_tokens: int = 8000, temperature: float | None = None,
                 post=curl_post_json):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.headers = {"authorization": f"Bearer {api_key}"}
        self.post = post
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.tools = [{"type": "function", "function": {"name": t.name, "description": t.description,
                                                         "parameters": t.parameters}} for t in tools]
        self.messages: list[dict] = [{"role": "system", "content": system}]

    def add_user(self, text: str) -> None:
        self.messages.append({"role": "user", "content": text})

    def add_tool_results(self, results: list[tuple[str, str, bool]]) -> None:
        for tid, out, _ok in results:
            self.messages.append({"role": "tool", "tool_call_id": tid, "content": out or "(no output)"})

    def step(self) -> Turn:
        payload = dict(model=self.model, messages=self.messages, tools=self.tools, max_tokens=self.max_tokens)
        if self.temperature is not None:
            payload["temperature"] = self.temperature
        resp = self.post(self.url, payload, self.headers)
        choice = resp["choices"][0]
        msg = choice["message"]
        calls = []
        for tc in msg.get("tool_calls") or []:
            try:
                args = json.loads(tc["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {"__invalid_json__": tc["function"].get("arguments")}
            calls.append(ToolCall(tc["id"], tc["function"]["name"], args))
        entry = {"role": "assistant", "content": msg.get("content") or ""}
        if msg.get("tool_calls"):
            entry["tool_calls"] = [{"id": tc["id"], "type": "function", "function": tc["function"]}
                                   for tc in msg["tool_calls"]]
        self.messages.append(entry)
        u = resp.get("usage") or {}
        usage = {"input_tokens": u.get("prompt_tokens", 0), "output_tokens": u.get("completion_tokens", 0)}
        return Turn(msg.get("content") or "", calls, usage, 0.0, choice.get("finish_reason") or "")
