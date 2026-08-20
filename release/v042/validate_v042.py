from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REQUIRED_CORE = {
    "image_settings.py",
    "image_marker_parser.py",
    "image_prompt_builder.py",
    "image_assets.py",
    "gpu_diagnostic.py",
    "web_ai_state.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v042.py <install-root>")
    root = Path(sys.argv[1])
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    init = root / "src" / "ai_article_studio" / "__init__.py"
    core = root / "src" / "ai_article_studio" / "core"
    if not app.is_file() or not init.is_file():
        raise RuntimeError("application files are missing")
    app_text = app.read_text(encoding="utf-8")
    if "# v0.4.2 Phase 3.6 image workflow" not in app_text:
        raise RuntimeError("v0.4.2 image UI marker missing")
    if '"画像生成設定"' not in app_text or '"画像プロンプト"' not in app_text:
        raise RuntimeError("v0.4.2 beginner image UI controls missing")
    version_text = init.read_text(encoding="utf-8")
    if '0.4.2' not in version_text:
        raise RuntimeError("version was not updated to 0.4.2")
    missing = [name for name in REQUIRED_CORE if not (core / name).is_file()]
    if missing:
        raise RuntimeError(f"missing Phase 3.6 core files: {missing}")
    compile(app_text, str(app), "exec")
    for name in REQUIRED_CORE:
        path = core / name
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    print("V0.4.2 IMAGE WORKFLOW VALIDATION OK")


if __name__ == "__main__":
    main()
