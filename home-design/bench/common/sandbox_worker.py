"""Worker process for the read-only IFC code sandbox.

Protocol: one JSON object per line on stdin, {"code": "..."}; one JSON object per
line on stdout, {"ok": bool, "output": "..."}. In edit mode (argv[2] == "edit") the
code may change the in-memory model, and the host (never the model's code) can send
{"save": path} to write it out. If argv[3] names a path, an edit-mode worker also writes
the model to "<path>.part" when its stdin closes, so the edit survives the host being
killed; the host checks the file and renames it. The IFC file named in argv[1] is
opened once; each request runs in a fresh namespace holding `ifc`, `ifcopenshell`
and the ifcopenshell util modules.

Writes are blocked by an audit hook (file opens for writing, deletes, renames,
directory changes, subprocesses, sockets) and by disabling ifcopenshell's writer.
This keeps an honest model from changing anything; it is not a security boundary
against deliberately hostile code (ctypes can still reach native calls).
"""

import contextlib
import io
import json
import os
import sys
import traceback

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
import ifcopenshell.util
import ifcopenshell.util.element
import ifcopenshell.util.placement
import ifcopenshell.util.selector
import ifcopenshell.util.unit

MAX_OUTPUT = int(os.environ.get("SANDBOX_MAX_OUTPUT", "20000"))

BLOCKED_EVENTS = {
    "os.remove", "os.rename", "os.rmdir", "os.mkdir", "os.chmod", "os.chown", "os.truncate",
    "os.link", "os.symlink", "os.utime", "shutil.rmtree", "shutil.move", "shutil.copyfile",
    "subprocess.Popen", "os.system", "os.exec", "os.posix_spawn", "os.spawn", "os.fork",
    "os.forkpty", "os.kill", "socket.connect", "socket.bind", "pty.spawn",
}
WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC


class ReadOnlyViolation(PermissionError):
    pass


def _hook(event, args):
    if event in BLOCKED_EVENTS:
        raise ReadOnlyViolation(f"read-only sandbox: {event} is not allowed")
    if event == "open":
        mode = args[1] if len(args) > 1 else "r"
        flags = args[2] if len(args) > 2 else 0
        if (isinstance(mode, str) and any(c in mode for c in "wax+")) or (isinstance(flags, int) and flags & WRITE_FLAGS):
            raise ReadOnlyViolation("read-only sandbox: opening a file for writing is not allowed")


def _no_write(*_a, **_k):
    raise ReadOnlyViolation("read-only sandbox: ifc.write() is not allowed")


def main() -> None:
    path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "read"
    save_on_exit = sys.argv[3] if len(sys.argv) > 3 and mode == "edit" else None
    model = ifcopenshell.open(path)
    host_write = ifcopenshell.file.write
    ifcopenshell.file.write = _no_write
    out = sys.stdout
    sys.stdout = io.StringIO()  # keep stray prints off the protocol channel
    sys.addaudithook(_hook)
    out.write(json.dumps({"ready": True, "schema": model.schema}) + "\n")
    out.flush()
    for line in sys.stdin:
        req = json.loads(line)
        if "save" in req:
            if mode != "edit":
                out.write(json.dumps({"ok": False, "output": "save is only allowed in edit mode"}) + "\n")
            else:
                host_write(model, req["save"])  # native writer: not routed through the audit hook
                out.write(json.dumps({"ok": True, "output": ""}) + "\n")
            out.flush()
            continue
        buf = io.StringIO()
        ns = {
            "ifc": model,
            "ifcopenshell": ifcopenshell,
            "__name__": "__sandbox__",
        }
        if mode == "edit":
            # BIM-Edit tool namespace (paper, appendix F.4): api, util, element_util, guid,
            # `result` returned to the model, and commit(). Edits live in memory and the
            # host saves the final state, so commit() only confirms.
            ns.update(api=ifcopenshell.api, util=ifcopenshell.util, element_util=ifcopenshell.util.element,
                      guid=ifcopenshell.guid, result=None,
                      commit=lambda: print("Changes committed."))
        ok = True
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                exec(compile(req["code"], "<tool>", "exec"), ns)
            except BaseException:  # the model sees its own traceback
                ok = False
                traceback.print_exc(limit=4, file=buf)
        text = buf.getvalue()
        if mode == "edit" and ns.get("result") is not None:
            text += ("" if not text or text.endswith("\n") else "\n") + f"result: {ns['result']!r}"
        if len(text) > MAX_OUTPUT:
            text = text[:MAX_OUTPUT] + f"\n... [output truncated at {MAX_OUTPUT} characters]"
        out.write(json.dumps({"ok": ok, "output": text}) + "\n")
        out.flush()
    if save_on_exit:
        host_write(model, save_on_exit + ".part")


if __name__ == "__main__":
    main()
