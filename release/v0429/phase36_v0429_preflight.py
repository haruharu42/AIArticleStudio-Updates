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
    result = {
        "app_root": str(root),
        "installed_version": read_version(init_file) if init_file.is_file() else "",
        "app_exists": app.is_file(),
        "v0428_ui": False,
        "show_create_exists": False,
        "live_hook_safe": False,
        "reason": "canonical_v0428_required",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["v0428_ui"] = "# v0.4.2.8 direct visual wizard activation" in text
        result["show_create_exists"] = "    def show_create(" in text
        result["live_hook_safe"] = (
            result["installed_version"] == "0.4.2.8"
            and result["v0428_ui"]
            and result["show_create_exists"]
            and "# v0.4.2.9 live show_create activation hook" not in text
        )
        if result["live_hook_safe"]:
            result["reason"] = "canonical_v0428_verified"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["live_hook_safe"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
