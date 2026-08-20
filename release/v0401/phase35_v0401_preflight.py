from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

ANCHORS = (
    "Web版AI",
    "ChatGPT",
    "Claude",
    "Gemini",
    "掲載先を開く",
)
SUPPORTED_FROM = {"0.3.9"}


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


def installed_version(app_root: Path) -> str:
    init = app_root / "src" / "ai_article_studio" / "__init__.py"
    if not init.is_file():
        return "unknown"
    try:
        text = init.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return "unknown"
    m = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', text)
    return m.group(1) if m else "unknown"


def inspect_active_ui(app_root: Path) -> dict[str, Any]:
    # Only inspect the canonical live UI file. Automatic updater backups live
    # under app_root/backup_* and must never count as patch candidates.
    path = app_root / "src" / "ai_article_studio" / "ui" / "app.py"
    if not path.is_file():
        return {"path": str(path), "exists": False, "readable_utf8": False, "anchors": []}
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return {"path": str(path), "exists": True, "readable_utf8": False, "anchors": []}
    hits = [anchor for anchor in ANCHORS if anchor in text]
    return {
        "path": str(path),
        "exists": True,
        "readable_utf8": True,
        "anchors": hits,
        "size": path.stat().st_size,
        "sha256": sha256(path),
    }


def probe(app_root: Path) -> dict[str, Any]:
    version = installed_version(app_root)
    ui = inspect_active_ui(app_root)
    result: dict[str, Any] = {
        "app_root": str(app_root),
        "exists": app_root.exists(),
        "installed_version": version,
        "supported_from": sorted(SUPPORTED_FROM),
        "active_ui": ui,
        "safe_to_patch": False,
        "reason": "",
    }
    if not app_root.exists():
        result["reason"] = "app_root_not_found"
    elif version not in SUPPORTED_FROM:
        result["reason"] = "unsupported_installed_version"
    elif not ui.get("exists"):
        result["reason"] = "active_ui_not_found"
    elif not ui.get("readable_utf8"):
        result["reason"] = "active_ui_not_utf8"
    elif len(ui.get("anchors", [])) < 2:
        result["reason"] = "active_ui_anchor_mismatch"
    else:
        result["safe_to_patch"] = True
        result["reason"] = "canonical_active_ui_verified"
    return result


def self_test() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "AIArticleStudio"
        active = root / "src" / "ai_article_studio" / "ui" / "app.py"
        init = root / "src" / "ai_article_studio" / "__init__.py"
        backup = root / "backup_auto_20990101_000000" / "src" / "ai_article_studio" / "ui" / "app.py"
        active.parent.mkdir(parents=True)
        backup.parent.mkdir(parents=True)
        active.write_text("# Web版AI\n# ChatGPT Claude Gemini\n# 掲載先を開く\n", encoding="utf-8")
        backup.write_text("# Web版AI\n# ChatGPT Claude Gemini\n# 掲載先を開く\n", encoding="utf-8")
        init.write_text('__version__ = "0.3.9"\n', encoding="utf-8")
        result = probe(root)
        assert result["safe_to_patch"] is True
        assert result["reason"] == "canonical_active_ui_verified"
        assert result["active_ui"]["path"] == str(active)

        init.write_text('__version__ = "0.4.0"\n', encoding="utf-8")
        result = probe(root)
        assert result["safe_to_patch"] is False
        assert result["reason"] == "unsupported_installed_version"
    print("V0.4.0.1 BRIDGE PREFLIGHT SELF-TEST OK")


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only v0.3.9 -> v0.4.0.1 bridge preflight")
    parser.add_argument("--app-root", type=Path, default=None)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    root = args.app_root or default_app_root()
    result = probe(root)
    # Keep stdout ASCII-safe for Windows PowerShell 5.1 / legacy console code pages.
    print(json.dumps(result, ensure_ascii=True, indent=2))
    raise SystemExit(0 if result["safe_to_patch"] else 2)


if __name__ == "__main__":
    main()
