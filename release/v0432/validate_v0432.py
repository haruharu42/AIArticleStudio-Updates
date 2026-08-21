from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.3.2"
REQUIRED_UI = (
    'ACTIVATION_MARKER = "v0.4.3.2-publish-safe-copy"',
    '"pages": pages',
    '"state": state',
    '"fields": fields',
    'bridge.build_title_step',
    'app.web_ai_bridge.build_article_step',
    'app.web_ai_bridge.ingest_step',
    'app.web_ai_bridge.publish_step',
    'render_completion()',
    'len(wizard.get("pages") or ()) != 6',
    '"画像差し込み用"',
    '"元記事"',
    '"v0432_marker"',
)
REQUIRED_CORE = {
    "article_publish_text.py": ("build_article_text_variants", "strip_illustration_summary", "strip_illustration_markers"),
    "web_ai_workflow.py": ("build_article_text_variants", "formatted_output=variants.publish_text"),
    "web_ai_ui_bridge.py": ("**variants.to_dict()",),
    "image_prompt_builder.py": ("2Dアニメ素材", "光沢の強いアプリアイコン", "発光するバブルUI"),
}


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0432.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    source27 = app.parent / "guided_wizard_v0427.py"
    source32 = app.parent / "guided_wizard_v0432.py"
    core_dir = app.parent.parent / "core"
    core_paths = {name: core_dir / name for name in REQUIRED_CORE}
    if not all(path.is_file() for path in (init_file, app, source27, source32, *core_paths.values())):
        raise RuntimeError("canonical v0.4.3.2 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    if app_text.count("# v0.4.3.2 embedded six-step creation flow") != 1:
        raise RuntimeError("v0.4.3.2 activation marker is missing or duplicated")
    if "from .guided_wizard_v0432 import activate_live_article_wizard" not in app_text:
        raise RuntimeError("v0.4.3.2 live activation import is missing")
    text31 = source32.read_text(encoding="utf-8")
    for token in REQUIRED_UI:
        if token not in text31:
            raise RuntimeError(f"embedded UI token missing: {token}")
    if "for item in items[:10]:" not in text31:
        raise RuntimeError("ten-item history list is not installed")
    for name, tokens in REQUIRED_CORE.items():
        core_text = core_paths[name].read_text(encoding="utf-8")
        for token in tokens:
            if token not in core_text:
                raise RuntimeError(f"publish-safe core token missing: {name}: {token}")
    for path in (app, source27, source32, *core_paths.values()):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    print("v0.4.3.2 validation OK")


if __name__ == "__main__":
    main()
