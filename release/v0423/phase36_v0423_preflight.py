from __future__ import annotations

import argparse
import json
from pathlib import Path

REQUIRED_VERSION = "0.4.2.2"
PHASE35_MARKER = "# v0.4.0 Phase 3.5 integrated Web AI"
PHASE36_MARKER = "# v0.4.2 Phase 3.6 image workflow"
V0422_MARKER = "# v0.4.2.2 linked image controls"


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def inspect(app_root: Path) -> dict:
    app = app_root / "src" / "ai_article_studio" / "ui" / "app.py"
    init = app_root / "src" / "ai_article_studio" / "__init__.py"
    prompt = app_root / "src" / "ai_article_studio" / "core" / "image_prompt_builder.py"
    result = {
        "app_root": str(app_root),
        "installed_version": read_version(init) if init.is_file() else "",
        "app_exists": app.is_file(),
        "prompt_builder_exists": prompt.is_file(),
        "phase35_ui": False,
        "phase36_ui": False,
        "v0422_ui": False,
        "safe_to_patch": False,
        "reason": "unknown",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["phase35_ui"] = PHASE35_MARKER in text
        result["phase36_ui"] = PHASE36_MARKER in text
        result["v0422_ui"] = V0422_MARKER in text
    if not app.is_file() or not init.is_file() or not prompt.is_file():
        result["reason"] = "canonical_application_files_missing"
    elif result["installed_version"] != REQUIRED_VERSION:
        result["reason"] = f"requires_v{REQUIRED_VERSION}"
    elif not result["phase35_ui"] or not result["phase36_ui"] or not result["v0422_ui"]:
        result["reason"] = "required_ui_marker_missing"
    else:
        result["safe_to_patch"] = True
        result["reason"] = "canonical_v0422_verified"
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
