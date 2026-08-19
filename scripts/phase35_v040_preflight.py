from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any


ANCHORS = (
    "Web版AI",
    "ChatGPT",
    "Claude",
    "Gemini",
    "掲載先を開く",
)


def default_app_root() -> Path:
    local = os.getenv("LOCALAPPDATA")
    if not local:
        raise RuntimeError("LOCALAPPDATA is not set")
    return Path(local) / "AIArticleStudio"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def inspect_python_file(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return {"path": str(path), "readable_utf8": False, "anchors": []}
    hits = [anchor for anchor in ANCHORS if anchor in text]
    return {
        "path": str(path),
        "readable_utf8": True,
        "anchors": hits,
        "size": path.stat().st_size,
        "sha256": sha256(path),
    }


def probe(app_root: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "app_root": str(app_root),
        "exists": app_root.exists(),
        "python_files": [],
        "ui_candidates": [],
        "safe_to_patch": False,
        "reason": "",
    }
    if not app_root.exists():
        result["reason"] = "app_root_not_found"
        return result

    files = sorted(p for p in app_root.rglob("*.py") if p.is_file())
    inspected = [inspect_python_file(p) for p in files]
    result["python_files"] = inspected
    candidates = [x for x in inspected if len(x.get("anchors", [])) >= 2]
    result["ui_candidates"] = candidates

    if len(candidates) == 1:
        result["safe_to_patch"] = True
        result["reason"] = "single_ui_candidate"
    elif not candidates:
        result["reason"] = "ui_candidate_not_found"
    else:
        result["reason"] = "multiple_ui_candidates"
    return result


def self_test() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "main.py").write_text(
            "# Web版AI\n# ChatGPT Claude Gemini\n# 掲載先を開く\n",
            encoding="utf-8",
        )
        (root / "other.py").write_text("print('ok')\n", encoding="utf-8")
        result = probe(root)
        assert result["safe_to_patch"] is True
        assert result["reason"] == "single_ui_candidate"
        assert len(result["ui_candidates"]) == 1
    print("PHASE 3.5 V0.4.0 PREFLIGHT SELF-TEST OK")


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only Phase 3.5 v0.4.0 UI preflight probe")
    parser.add_argument("--app-root", type=Path, default=None)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    root = args.app_root or default_app_root()
    result = probe(root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["safe_to_patch"] else 2)


if __name__ == "__main__":
    main()
