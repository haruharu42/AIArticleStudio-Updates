from __future__ import annotations

import ast
import sys
from pathlib import Path

REQUIRED_CORE = [
    "paid_value.py",
    "web_ai_config.py",
    "web_ai_ingest.py",
    "web_ai_prompt_builder.py",
    "web_ai_publish.py",
    "web_ai_repair.py",
    "web_ai_state.py",
    "web_ai_ui_bridge.py",
    "web_ai_workflow.py",
]

REQUIRED_APP_MARKERS = [
    "# v0.4.0 Phase 3.5 integrated Web AI",
    "WebAIUIBridge",
    "load_web_ai_model_config",
    "self.web_ai_bridge.build_title_step",
    "self.web_ai_bridge.build_article_step",
    "self.web_ai_bridge.ingest_step",
    "self.web_ai_bridge.publish_step",
    "build_issue_repair_prompt",
    "修正用プロンプト",
    "✓ 作成完了",
]


def fail(message: str) -> None:
    raise RuntimeError(message)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v040.py <AIArticleStudio install root>")
    root = Path(sys.argv[1])
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    init = root / "src" / "ai_article_studio" / "__init__.py"
    core = root / "src" / "ai_article_studio" / "core"
    if not app.is_file() or not init.is_file():
        fail("application files are missing")
    app_text = app.read_text(encoding="utf-8")
    init_text = init.read_text(encoding="utf-8")
    if '__version__ = "0.4.0"' not in init_text:
        fail("version is not v0.4.0")
    for marker in REQUIRED_APP_MARKERS:
        if marker not in app_text:
            fail(f"missing app marker: {marker}")
    if app_text.count("# v0.4.0 Phase 3.5 integrated Web AI") != 2:
        fail("v0.4.0 marker count is unexpected")
    ast.parse(app_text, filename=str(app))
    for name in REQUIRED_CORE:
        path = core / name
        if not path.is_file():
            fail(f"missing Phase 3.5 core file: {name}")
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    print("V0.4.0 FEATURE VALIDATION OK")


if __name__ == "__main__":
    main()
