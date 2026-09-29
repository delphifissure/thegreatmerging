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

    mode "read": the model is never written. mode "edit": code may change the
    in-memory model, and `save()` writes it out. In both modes the model's code
    cannot write files itself.

    `run(code)` executes read-only Python against `ifc` and returns (ok, output).
    A call that exceeds `timeout_s` kills the worker, which is restarted (the file
    is re-opened) on the next call.
    """

    def __init__(self, ifc_path: str | Path, timeout_s: float = 120.0, load_timeout_s: float = 600.0,
                 mode: str = "read", save_on_exit: str | Path | None = None):
        assert mode in ("read", "edit")
        assert save_on_exit is None or mode == "edit"
        self.mode = mode
        self.save_on_exit = str(save_on_exit) if save_on_exit else None
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
            [sys.executable, str(WORKER), self.ifc_path, self.mode] + ([self.save_on_exit] if self.save_on_exit else []),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, cwd=self.workdir, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            # A worker that saves on exit must outlive a killed host.
            start_new_session=bool(self.save_on_exit),
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

    def save(self, dest: str | Path) -> bool:
        """Edit mode only: write the in-memory model to `dest` atomically. False if the worker is gone."""
        if self.proc is None or self.proc.poll() is not None:
            return False
        tmp = f"{dest}.part"
        self.proc.stdin.write(json.dumps({"save": tmp}) + "\n")
        self.proc.stdin.flush()
        line = self._readline(self.load_timeout_s)
        if not line or not json.loads(line)["ok"]:
            return False
        os.replace(tmp, dest)
        return True

    def detach(self) -> None:
        """Close the worker's stdin and leave it running; a save_on_exit worker then writes its file."""
        if self.proc is not None:
            try:
                self.proc.stdin.close()
            except OSError:
                pass
            self.proc = None

    def close(self) -> None:
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()
            self.proc = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def finish_saved(dest: str | Path, timeout_s: float = 900.0) -> bool:
    """Wait for a save_on_exit worker to finish writing `<dest>.part`, check it, rename it.

    The worker is found by its command line, which carries the destination path. The file
    must end with the STEP terminator, so a worker killed mid-write is not accepted.
    """
    import time

    dest = Path(dest)
    part = Path(f"{dest}.part")
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        busy = subprocess.run(["pgrep", "-f", str(dest)], capture_output=True).returncode == 0
        if not busy:
            break
        time.sleep(2)
    else:
        return False
    if not part.exists() or part.stat().st_size < 32:
        return False
    with part.open("rb") as f:
        f.seek(-64, os.SEEK_END)
        if b"END-ISO-10303-21;" not in f.read():
            return False
    os.replace(part, dest)
    return True
