from __future__ import annotations

import argparse
import json
from pathlib import Path


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", required=True)
    args = parser.parse_args()
    root = Path(args.app_root)
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    ui_dir = app.parent
    core_dir = ui_dir.parent / "core"
    required = [ui_dir / f"guided_wizard_v042{number}.py" for number in (7, 8, 9)]
    required_core = [core_dir / name for name in ("web_ai_workflow.py", "web_ai_ui_bridge.py", "image_prompt_builder.py")]
    result = {
        "app_root": str(root),
        "installed_version": read_version(init_file) if init_file.is_file() else "",
        "app_exists": app.is_file(),
        "v0429_hook": False,
        "activation_import": "",
        "wizard_modules": all(path.is_file() for path in required),
        "core_modules": all(path.is_file() for path in required_core),
        "safe_to_update": False,
        "reason": "canonical_v0429_v0430_or_v0431_required",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["v0429_hook"] = "# v0.4.2.9 live show_create activation hook" in text
        if "from .guided_wizard_v0431 import activate_live_article_wizard" in text:
            result["activation_import"] = "v0431"
        elif "from .guided_wizard_v0429 import activate_live_article_wizard" in text:
            result["activation_import"] = "v0429"
        version = result["installed_version"]
        version_and_hook = (
            (version in {"0.4.2.9", "0.4.3.0"} and result["activation_import"] == "v0429")
            or (version == "0.4.3.1" and result["activation_import"] == "v0431")
        )
        result["safe_to_update"] = (
            version_and_hook
            and result["v0429_hook"]
            and result["wizard_modules"]
            and result["core_modules"]
        )
        if result["safe_to_update"]:
            result["reason"] = f"canonical_v{result['installed_version'].replace('.', '')}_verified"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["safe_to_update"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
