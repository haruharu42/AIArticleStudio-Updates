from __future__ import annotations

import argparse
import json
from pathlib import Path

REQUIRED_VERSION = "0.4.2.1"
PHASE35_MARKER = "# v0.4.0 Phase 3.5 integrated Web AI"
PHASE36_MARKER = "# v0.4.2 Phase 3.6 image workflow"
V0421_VISIBLE_PACK = 'self.image_settings_card.pack(fill="x", pady=(0,12))'
IMAGE_PROMPT_BUTTON = 'self._secondary_button(publish_links,"画像プロンプト",self._show_image_prompts)'
REQUIRED_CORE = (
    "image_settings.py",
    "image_prompt_builder.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
)


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
        "app_exists": app.is_file(),
        "init_exists": init.is_file(),
        "installed_version": read_version(init) if init.is_file() else "",
        "phase35_ui": False,
        "phase36_ui": False,
        "v0421_image_card_visible": False,
        "image_prompt_button": False,
        "required_core": {},
        "safe_to_patch": False,
        "reason": "unknown",
    }
    text = ""
    if app.is_file():
        try:
            text = app.read_text(encoding="utf-8")
            result["phase35_ui"] = PHASE35_MARKER in text
            result["phase36_ui"] = PHASE36_MARKER in text
            result["v0421_image_card_visible"] = V0421_VISIBLE_PACK in text
            result["image_prompt_button"] = IMAGE_PROMPT_BUTTON in text
        except OSError:
            pass
    for name in REQUIRED_CORE:
        result["required_core"][name] = (core / name).is_file()

    if not app.is_file() or not init.is_file():
        result["reason"] = "canonical_application_files_missing"
    elif result["installed_version"] != REQUIRED_VERSION:
        result["reason"] = f"requires_v{REQUIRED_VERSION}"
    elif not result["phase35_ui"] or not result["phase36_ui"]:
        result["reason"] = "required_ui_marker_missing"
    elif not result["v0421_image_card_visible"]:
        result["reason"] = "v0421_visibility_hotfix_missing"
    elif not result["image_prompt_button"]:
        result["reason"] = "image_prompt_button_missing"
    elif not all(result["required_core"].values()):
        result["reason"] = "required_v0421_core_missing"
    else:
        result["safe_to_patch"] = True
        result["reason"] = "canonical_v0421_verified"
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
