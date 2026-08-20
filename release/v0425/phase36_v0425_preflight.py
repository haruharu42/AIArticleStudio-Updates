from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_VERSION = "0.4.2.4"
PHASE35_MARKER = "# v0.4.0 Phase 3.5 integrated Web AI"
PHASE36_MARKER = "# v0.4.2 Phase 3.6 image workflow"
V0424_MARKER = "# v0.4.2.4 pre-article image planning controls"
REQUIRED_APP_TOKENS = (
    "self._update_image_plan_controls",
    "self._show_image_prompts",
    "self.web_ai_bridge.build_article_step",
)
REQUIRED_CORE = ("web_ai_state.py", "web_ai_ui_bridge.py")


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
        "core_exists": all((core / name).is_file() for name in REQUIRED_CORE),
        "phase35_ui": False,
        "phase36_ui": False,
        "v0424_ui": False,
        "required_anchors": False,
        "safe_to_patch": False,
        "reason": "unknown",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["phase35_ui"] = PHASE35_MARKER in text
        result["phase36_ui"] = PHASE36_MARKER in text
        result["v0424_ui"] = V0424_MARKER in text
        result["required_anchors"] = all(token in text for token in REQUIRED_APP_TOKENS)
    if not app.is_file() or not init.is_file() or not result["core_exists"]:
        result["reason"] = "canonical_application_files_missing"
    elif result["installed_version"] != REQUIRED_VERSION:
        result["reason"] = f"requires_v{REQUIRED_VERSION}"
    elif not all((result["phase35_ui"], result["phase36_ui"], result["v0424_ui"], result["required_anchors"])):
        result["reason"] = "required_v0424_marker_missing"
    else:
        result["safe_to_patch"] = True
        result["reason"] = "canonical_v0424_verified"
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
