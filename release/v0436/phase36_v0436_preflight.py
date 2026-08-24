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
    root = Path(parser.parse_args().app_root)
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    auth_ui = app.parent / "auth_ui.py"
    auth_core = app.parent.parent / "core" / "auth_service.py"
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    version = read_version(init_file) if init_file.is_file() else ""
    app_text = app.read_text(encoding="utf-8") if app.is_file() else ""
    ui_text = auth_ui.read_text(encoding="utf-8") if auth_ui.is_file() else ""
    core_text = auth_core.read_text(encoding="utf-8") if auth_core.is_file() else ""
    safe = bool(
        version in {"0.4.3.4", "0.4.3.5"}
        and app_text.count("# v0.4.3.3 Auth/UI Foundation") == 1
        and "AI_NOTICE" in ui_text
        and 'token?grant_type=pkce' in core_text
        and (version == "0.4.3.4" or ("USER MANAGEMENT" in ui_text and "admin_set_user_status" in core_text))
    )
    result = {
        "app_root": str(root),
        "installed_version": version,
        "safe_to_update": safe,
        "reason": f"canonical_v{version.replace('.', '')}_verified" if safe else "canonical_v0434_or_v0435_required",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not safe:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
