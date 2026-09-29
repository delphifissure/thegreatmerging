"""Download files from Hugging Face dataset repos, pinned to a revision."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

HF = "https://huggingface.co"


def download(repo: str, path: str, dest: Path, revision: str = "main") -> Path:
    """Fetch `path` from dataset `repo` into `dest` unless it is already there."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{HF}/datasets/{repo}/resolve/{revision}/{path}"
    tmp = dest.with_suffix(dest.suffix + ".part")
    # curl picks up the session's CA bundle and proxy settings as configured.
    subprocess.run(["curl", "-sSfL", "--retry", "4", "-o", str(tmp), url], check=True, timeout=3600)
    tmp.rename(dest)
    return dest


def dataset_sha(repo: str) -> str:
    """Current commit sha of a dataset repo, recorded with every run."""
    out = subprocess.run(["curl", "-sSfL", f"{HF}/api/datasets/{repo}"], check=True,
                         capture_output=True, text=True, timeout=120).stdout
    return json.loads(out)["sha"]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
