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
        "v0426_ui": False,
        "visual_patch_safe": False,
        "reason": "canonical_v0426_required",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["v0426_ui"] = "# v0.4.2.6 embedded single-item article wizard" in text
        result["visual_patch_safe"] = (
            result["installed_version"] == "0.4.2.6"
            and result["v0426_ui"]
            and "def _install_single_item_article_wizard(self, body):" in text
            and "def _install_web_ai_article_wizard(self, win, req, pages, fields):" in text
            and "win = self._create_embedded_article_workspace()" in text
        )
        if result["visual_patch_safe"]:
            result["reason"] = "canonical_v0426_verified"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["visual_patch_safe"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
