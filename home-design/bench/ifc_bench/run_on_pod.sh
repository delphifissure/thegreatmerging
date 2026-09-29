#!/usr/bin/env bash
# Wait for the vLLM pod, run IFC-Bench on it, then terminate the pod.
# The pod is terminated when the run exits, fails, or passes MAX_HOURS.
set -u
NAME=${1:-hd-gemma4}; RUN_ID=${2:-gemma4-31b}; MAX_HOURS=${3:-3}
cd "$(dirname "$0")/../.."
S=runs/pods/$NAME.json
URL=$(python3 -c "import json;print(json.load(open('$S'))['base_url'])")
KEY=$(python3 -c "import json;print(json.load(open('$S'))['api_key'])")
deadline=$(( $(date +%s) + MAX_HOURS * 3600 ))
until [ "$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$URL/models" -H "Authorization: Bearer $KEY")" = 200 ]; do
  [ "$(date +%s)" -ge "$deadline" ] && break
  sleep 20
done
.venv/bin/python -m bench.ifc_bench.run --backend vllm --model google/gemma-4-31B-it \
  --base-url "$URL" --api-key "$KEY" --run-id "$RUN_ID" --workers 6 &
RUN_PID=$!
while kill -0 $RUN_PID 2>/dev/null && [ "$(date +%s)" -lt "$deadline" ]; do sleep 30; done
kill $RUN_PID 2>/dev/null
.venv/bin/python -m bench.common.runpod down --name "$NAME"
