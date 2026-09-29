"""Resumable worker loop for plan-limited Claude Code runs.

Each item's result is appended to a JSONL file as soon as it finishes. Items already
recorded (other than errors) are skipped on the next start. When a run reports a usage
limit, every worker pauses, then retries the same item; after `give_up_hours` of waiting
the loop stops cleanly and the next start picks up where it left off.
"""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

RETRY_STOPS = {"error", "rate_limited", "timeout"}


def load_done(path: Path, key: str) -> set:
    if not path.exists():
        return set()
    return {r[key] for r in map(json.loads, filter(str.strip, path.read_text().splitlines()))
            if r.get("stop") not in RETRY_STOPS}


def run_items(items: list, key: Callable, work: Callable[[object], dict], out: Path, workers: int,
              limit_wait_s: int = 900, give_up_hours: float = 12.0, label: Callable = str) -> None:
    lock = threading.Lock()
    pause = {"until": 0.0, "since": None, "stopped": False}
    n = {"done": 0}

    def one(item) -> None:
        while True:
            if pause["stopped"]:
                return
            wait = pause["until"] - time.time()
            if wait > 0:
                time.sleep(min(wait, 60))
                continue
            rec = work(item)
            if rec.get("stop") == "rate_limited":
                with lock:
                    now = time.time()
                    pause["since"] = pause["since"] or now
                    if now - pause["since"] > give_up_hours * 3600:
                        pause["stopped"] = True
                        print(f"usage limit persisted {give_up_hours} h; stopping (resume later)", flush=True)
                        return
                    pause["until"] = max(pause["until"], now + limit_wait_s)
                    print(f"usage limit hit on {label(item)}; pausing {limit_wait_s // 60} min", flush=True)
                continue
            with lock:
                pause["since"] = None
                with out.open("a") as f:
                    f.write(json.dumps(rec) + "\n")
                n["done"] += 1
                print(f"[{n['done']}/{len(items)}] {label(item)} {rec.get('stop')} calls={rec.get('tool_calls')} "
                      f"{rec.get('seconds', 0):.0f}s", flush=True)
            return

    with ThreadPoolExecutor(workers) as ex:
        for f in [ex.submit(one, it) for it in items]:
            f.result()
