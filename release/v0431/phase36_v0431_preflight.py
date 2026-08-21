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
    required = [ui_dir / f"guided_wizard_v042{number}.py" for number in (7, 8, 9)]
    result = {
        "app_root": str(root),
        "installed_version": read_version(init_file) if init_file.is_file() else "",
        "app_exists": app.is_file(),
        "v0429_hook": False,
        "v0430_flow": False,
        "wizard_modules": all(path.is_file() for path in required),
        "safe_to_update": False,
        "reason": "canonical_v0429_or_v0430_required",
    }
    if app.is_file():
        text = app.read_text(encoding="utf-8")
        result["v0429_hook"] = "# v0.4.2.9 live show_create activation hook" in text
        source27 = ui_dir / "guided_wizard_v0427.py"
        if source27.is_file():
            source_text = source27.read_text(encoding="utf-8")
            result["v0430_flow"] = "app._v0430_creation_action = text" in source_text and 'text="AIおまかせ"' in source_text
        from_v0429 = result["installed_version"] == "0.4.2.9"
        from_v0430 = result["installed_version"] == "0.4.3.0" and result["v0430_flow"]
        result["safe_to_update"] = (
            (from_v0429 or from_v0430)
            and result["v0429_hook"]
            and result["wizard_modules"]
        )
        if result["safe_to_update"]:
            result["reason"] = f"canonical_v{result['installed_version'].replace('.', '')}_verified"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["safe_to_update"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
