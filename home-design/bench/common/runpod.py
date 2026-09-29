"""Start, watch and stop a vLLM pod on RunPod, recording its cost against the cap.

    python -m bench.common.runpod up --name hd-gemma4 --model google/gemma-4-31B-it --max-hours 6
    python -m bench.common.runpod status --name hd-gemma4
    python -m bench.common.runpod down --name hd-gemma4

Only pods this module created (names starting "hd-") are touched. Pod state and the
endpoint API key live in runs/pods/<name>.json, which is not committed.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import time
from pathlib import Path

from .budget import Budget

API = "https://api.runpod.io/graphql"
POD_DIR = Path(__file__).resolve().parents[2] / "runs" / "pods"
PREFIX = "hd-"

GEMMA4_ARGS = (
    "--model {model} --served-model-name {model} --max-model-len {ctx} --gpu-memory-utilization 0.92 "
    "--enable-auto-tool-choice --tool-call-parser gemma4 --reasoning-parser gemma4 "
    "--chat-template examples/tool_chat_template_gemma4.jinja "
    "--host 0.0.0.0 --port 8000 --api-key {key}"
)


def gql(query: str, variables: dict | None = None) -> dict:
    body = json.dumps({"query": query, "variables": variables or {}})
    proc = subprocess.run(
        ["curl", "-sS", "--fail-with-body", API, "-H", "content-type: application/json",
         "-H", f"Authorization: Bearer {os.environ['RUNPOD_API_KEY']}", "--data-binary", "@-"],
        input=body, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"RunPod API error: {proc.stderr} {proc.stdout[:500]}")
    data = json.loads(proc.stdout)
    if data.get("errors"):
        raise RuntimeError(f"RunPod API error: {data['errors']}")
    return data["data"]


def state_file(name: str) -> Path:
    return POD_DIR / f"{name}.json"


def pod_info(pod_id: str) -> dict | None:
    q = """query($id: String!) { pod(input: {podId: $id}) { id name desiredStatus costPerHr
            runtime { uptimeInSeconds } machine { gpuDisplayName } } }"""
    return gql(q, {"id": pod_id})["pod"]


def up(name: str, model: str, gpu_types: list[str], ctx: int, max_hours: float, cloud: str) -> dict:
    assert name.startswith(PREFIX), f"pod names must start with {PREFIX!r}"
    POD_DIR.mkdir(parents=True, exist_ok=True)
    if state_file(name).exists():
        raise SystemExit(f"{name} already has a state file; run `down` first")
    budget = Budget.load()
    key = secrets.token_urlsafe(24)
    mutation = """mutation($input: PodFindAndDeployOnDemandInput) {
        podFindAndDeployOnDemand(input: $input) { id name costPerHr machine { gpuDisplayName } } }"""
    last_err = None
    for gpu in gpu_types:
        inp = {
            "cloudType": cloud, "gpuCount": 1, "gpuTypeId": gpu, "name": name,
            "imageName": "vllm/vllm-openai:latest",
            "dockerArgs": GEMMA4_ARGS.format(model=model, ctx=ctx, key=key),
            "ports": "8000/http", "volumeInGb": 0, "containerDiskInGb": 120,
            "env": [],
        }
        try:
            pod = gql(mutation, {"input": inp})["podFindAndDeployOnDemand"]
        except RuntimeError as e:
            last_err = e
            continue
        if pod:
            # Refuse to keep a pod whose worst-case run would pass the cap.
            worst = pod["costPerHr"] * max_hours
            state = {"id": pod["id"], "name": name, "model": model, "gpu": pod["machine"]["gpuDisplayName"],
                     "cost_per_hr": pod["costPerHr"], "max_hours": max_hours, "started": time.time(),
                     "api_key": key, "base_url": f"https://{pod['id']}-8000.proxy.runpod.net/v1"}
            state_file(name).write_text(json.dumps(state, indent=2))
            try:
                budget.require(worst, f"pod {name} for up to {max_hours} h at ${pod['costPerHr']}/h")
            except Exception:
                down(name)
                raise
            return state
    raise RuntimeError(f"no GPU available from {gpu_types}: {last_err}")


def down(name: str) -> float:
    """Terminate the pod and record its cost (uptime x hourly rate, at least the wall time since start)."""
    st = json.loads(state_file(name).read_text())
    info = pod_info(st["id"])
    uptime = (info or {}).get("runtime", {}) or {}
    secs = max(uptime.get("uptimeInSeconds") or 0, time.time() - st["started"])
    gql("""mutation($id: String!) { podTerminate(input: {podId: $id}) }""", {"id": st["id"]})
    usd = st["cost_per_hr"] * secs / 3600
    Budget.load().record(usd, "runpod", st["name"], {"pod_id": st["id"], "gpu": st["gpu"], "seconds": round(secs)})
    done = state_file(name).with_suffix(".terminated.json")
    st.pop("api_key", None)
    done.write_text(json.dumps({**st, "terminated": time.time(), "seconds": secs, "usd": usd}, indent=2))
    state_file(name).unlink()
    return usd


def status(name: str) -> dict:
    st = json.loads(state_file(name).read_text())
    info = pod_info(st["id"])
    elapsed_h = (time.time() - st["started"]) / 3600
    return {"pod": info, "elapsed_hours": round(elapsed_h, 2), "spent_so_far_usd": round(elapsed_h * st["cost_per_hr"], 2),
            "over_max_hours": elapsed_h > st["max_hours"], "base_url": st["base_url"]}


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["up", "down", "status"])
    ap.add_argument("--name", required=True)
    ap.add_argument("--model", default="google/gemma-4-31B-it")
    ap.add_argument("--gpu", action="append", help="RunPod gpuTypeId, tried in order")
    ap.add_argument("--ctx", type=int, default=65536)
    ap.add_argument("--max-hours", type=float, default=6.0)
    ap.add_argument("--cloud", default="COMMUNITY", choices=["COMMUNITY", "SECURE", "ALL"])
    a = ap.parse_args(argv)
    if a.cmd == "up":
        gpus = a.gpu or ["NVIDIA H100 PCIe", "NVIDIA H100 80GB HBM3", "NVIDIA A100-SXM4-80GB", "NVIDIA A100 80GB PCIe"]
        st = up(a.name, a.model, gpus, a.ctx, a.max_hours, a.cloud)
        print(json.dumps({k: v for k, v in st.items() if k != "api_key"}, indent=2))
    elif a.cmd == "down":
        print(f"terminated; recorded ${down(a.name):.2f}")
    else:
        print(json.dumps(status(a.name), indent=2))


if __name__ == "__main__":
    main()
