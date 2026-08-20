from __future__ import annotations

import sys
from pathlib import Path

VERSION = "0.4.2.2"
MARKER = "# v0.4.2.2 linked image controls"
TOP_IMAGE_PACK = 'self.image_settings_card.pack(fill="x", pady=(0,12))'
REQUIRED_UI_TEXT = (
    "記事に合う画像を作る",
    "アニメ風",
    "漫画風",
    "画像プロンプトを作る",
    "記事内容との連携：ON",
)
CORE_EXPECTATIONS = {
    "image_settings.py": ("anime", "manga", "catchy_thumbnail", "infographic"),
    "image_prompt_builder.py": ("article_linked", "derived_from_article", "実際の記事内容"),
    "web_ai_workflow.py": ("validate_image_prompt_requirements", "article_source", "style_label"),
    "web_ai_ui_bridge.py": ("image_prompt_status", "build_image_prompts"),
}


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0422.py <install-root>")
    root = Path(sys.argv[1])
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    init = root / "src" / "ai_article_studio" / "__init__.py"
    core = root / "src" / "ai_article_studio" / "core"
    if not app.is_file() or not init.is_file():
        raise RuntimeError("canonical application files missing")
    if read_version(init) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    text = app.read_text(encoding="utf-8")
    if text.count(MARKER) != 1:
        raise RuntimeError("v0.4.2.2 UI marker missing or duplicated")
    if TOP_IMAGE_PACK in text:
        raise RuntimeError("old top image settings placement is still active")
    for required in REQUIRED_UI_TEXT:
        if required not in text:
            raise RuntimeError(f"required UI text missing: {required}")
    for name, needles in CORE_EXPECTATIONS.items():
        path = core / name
        if not path.is_file():
            raise RuntimeError(f"required core file missing: {name}")
        core_text = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in core_text:
                raise RuntimeError(f"{name}: expected token missing: {needle}")
    print("v0.4.2.2 validation OK")


if __name__ == "__main__":
    main()
