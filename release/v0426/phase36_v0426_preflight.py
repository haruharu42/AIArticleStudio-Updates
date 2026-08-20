from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_VERSION = "0.4.2.5"
V0424_MARKER = "# v0.4.2.4 pre-article image planning controls"
V0425_MARKER = "# v0.4.2.5 guided article wizard and recent history"
APP_TOKENS = (
    "self._install_create_step_wizard(body)",
    "def _install_web_ai_article_wizard",
    "最近の作業（最大10件）",
    "def _open_web_ai_mode(self):",
)
CORE_TOKENS = {
    "web_ai_state.py": ("DEFAULT_HISTORY_LIMIT = 10", "def recent_summaries", "def start_new"),
    "web_ai_ui_bridge.py": ("def history_items", "def new_article", "def clear_article_content"),
}


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def inspect(app_root: Path) -> dict:
    app = app_root / "src" / "ai_article_studio" / "ui" / "app.py"
    init = app_root / "src" / "ai_article_studio" / "__init__.py"
    core = app_root / "src" / "ai_article_studio" / "core"
    result = {
        "app_root": str(app_root),
        "installed_version": read_version(init) if init.is_file() else "",
        "app_exists": app.is_file(),
        "v0424_ui": False,
        "v0425_ui": False,
        "required_anchors": False,
        "history_core": False,
        "safe_to_patch": False,
        "reason": "unknown",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["v0424_ui"] = V0424_MARKER in text
        result["v0425_ui"] = V0425_MARKER in text
        method_start = text.find("    def _open_web_ai_mode(self):\n")
        method_end = text.find("\n    def ", method_start + 5) if method_start >= 0 else -1
        method = text[method_start : (method_end if method_end >= 0 else len(text))] if method_start >= 0 else ""
        result["required_anchors"] = all(token in text for token in APP_TOKENS) and "tk.Toplevel(self)" in method
    result["history_core"] = True
    for name, tokens in CORE_TOKENS.items():
        path = core / name
        if not path.is_file() or not all(token in path.read_text(encoding="utf-8") for token in tokens):
            result["history_core"] = False
    if not app.is_file() or not init.is_file():
        result["reason"] = "canonical_application_files_missing"
    elif result["installed_version"] != REQUIRED_VERSION:
        result["reason"] = f"requires_v{REQUIRED_VERSION}"
    elif not all((result["v0424_ui"], result["v0425_ui"], result["required_anchors"], result["history_core"])):
        result["reason"] = "required_v0425_marker_missing"
    else:
        result["safe_to_patch"] = True
        result["reason"] = "canonical_v0425_verified"
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", type=Path, required=True)
    args = parser.parse_args()
    result = inspect(args.app_root)
    print(json.dumps(result, ensure_ascii=True, indent=2))
    if not result["safe_to_patch"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
