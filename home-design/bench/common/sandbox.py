"""Read-only IFC code sandbox with a per-call timeout and a per-task call budget."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

WORKER = Path(__file__).with_name("sandbox_worker.py")


class CallBudgetExhausted(RuntimeError):
    pass


class IfcSandbox:
    """One worker process holding one opened IFC file.

    `run(code)` executes read-only Python against `ifc` and returns (ok, output).
    A call that exceeds `timeout_s` kills the worker, which is restarted (the file
    is re-opened) on the next call.
    """

    def __init__(self, ifc_path: str | Path, timeout_s: float = 120.0, load_timeout_s: float = 600.0):
        self.ifc_path = str(ifc_path)
        self.timeout_s = timeout_s
        self.load_timeout_s = load_timeout_s
        self.proc: subprocess.Popen | None = None
        self.workdir = tempfile.mkdtemp(prefix="ifc-sandbox-")

    def _readline(self, timeout: float) -> str | None:
        result: list[str] = []
        t = threading.Thread(target=lambda: result.append(self.proc.stdout.readline()), daemon=True)
        t.start()
        t.join(timeout)
        return result[0] if result else None

    def _start(self) -> None:
        self.proc = subprocess.Popen(
            [sys.executable, str(WORKER), self.ifc_path],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, cwd=self.workdir, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        line = self._readline(self.load_timeout_s)
        if not line:
            self.close()
            raise RuntimeError(f"sandbox worker failed to open {self.ifc_path}")

    def run(self, code: str) -> tuple[bool, str]:
        if self.proc is None or self.proc.poll() is not None:
            self._start()
        self.proc.stdin.write(json.dumps({"code": code}) + "\n")
        self.proc.stdin.flush()
        line = self._readline(self.timeout_s)
        if line is None:
            self.close()
            return False, f"Execution timed out after {self.timeout_s:.0f} s; the interpreter was restarted."
        if not line:
            self.close()
            return False, "The interpreter crashed; it was restarted."
        resp = json.loads(line)
        return resp["ok"], resp["output"]

    def close(self) -> None:
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()
            self.proc = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
