from __future__ import annotations

import argparse
import json
from pathlib import Path

REQUIRED_VERSION = "0.4.1"
UI_MARKER = "# v0.4.0 Phase 3.5 integrated Web AI"
# Only files that must already exist in a normal v0.4.1 installation belong
# here. Phase 3.6 image modules are delivered by the v0.4.2 package itself and
# must NOT be required before the patch runs.
V041_REQUIRED_CORE = (
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
    "web_prompt_engine_v2.py",
)


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def inspect(app_root: Path) -> dict:
    # Inspect canonical live application files only. Do not recursively scan the
    # app root because the updater creates backup_auto_* before running us.
    app = app_root / "src" / "ai_article_studio" / "ui" / "app.py"
    init = app_root / "src" / "ai_article_studio" / "__init__.py"
    core = app_root / "src" / "ai_article_studio" / "core"
    result = {
        "app_root": str(app_root),
        "app_exists": app.is_file(),
        "init_exists": init.is_file(),
        "installed_version": read_version(init) if init.is_file() else "",
        "integrated_ui": False,
        "required_core": {},
        "safe_to_patch": False,
        "reason": "unknown",
    }
    if app.is_file():
        try:
            result["integrated_ui"] = UI_MARKER in app.read_text(encoding="utf-8")
        except OSError:
            pass
    for name in V041_REQUIRED_CORE:
        result["required_core"][name] = (core / name).is_file()
    if not app.is_file() or not init.is_file():
        result["reason"] = "canonical_application_files_missing"
    elif result["installed_version"] != REQUIRED_VERSION:
        result["reason"] = f"requires_v{REQUIRED_VERSION}"
    elif not result["integrated_ui"]:
        result["reason"] = "phase35_ui_marker_missing"
    elif not all(result["required_core"].values()):
        result["reason"] = "required_v041_core_missing"
    else:
        result["safe_to_patch"] = True
        result["reason"] = "canonical_v041_verified"
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", type=Path, required=True)
    args = parser.parse_args()
    result = inspect(args.app_root)
    # ASCII-safe JSON avoids legacy Windows console encoding failures while
    # still preserving paths and messages unambiguously through \u escapes.
    print(json.dumps(result, ensure_ascii=True, indent=2))
    if not result["safe_to_patch"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
