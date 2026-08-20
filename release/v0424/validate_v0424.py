from __future__ import annotations

import sys
from pathlib import Path

VERSION = "0.4.2.4"
APP_REQUIRED = (
    "# v0.4.2.4 pre-article image planning controls",
    'text="アイキャッチを作成（noteなどでは推奨）"',
    'text="記事内の挿絵を作成"',
    'values=["AIにおまかせ","1","2","3","4","5","6"]',
    "self._sync_image_settings()\n            _article_step",
    'self._secondary_button(publish_links,"画像プロンプト"',
)
CORE_REQUIRED = {
    "image_settings.py": ('VALID_COUNTS = {"auto", "1", "2", "3", "4", "5", "6"}',),
    "image_prompt_builder.py": ("_meaningful_headings", "SKIP_ILLUSTRATION_HEADINGS", "min(6, suggested)", "STYLE_RULES"),
    "web_prompt_engine_v2.py": ("本文を最後まで書いた後に記事全体を読み直し", "必要最小限を1〜6枚"),
    "web_ai_workflow.py": ("アイキャッチを作成", "記事内の挿絵を作成"),
}


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0424.py <install-root>")
    root = Path(sys.argv[1])
    init = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    core = root / "src" / "ai_article_studio" / "core"
    if not init.is_file() or not app.is_file():
        raise RuntimeError("canonical application files missing")
    if read_version(init) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    for token in APP_REQUIRED:
        if token not in app_text:
            raise RuntimeError(f"application token missing: {token}")
    if "linked_image_card=tk.Frame(step4" in app_text:
        raise RuntimeError("old post-article image settings panel still exists")
    if app_text.count("# v0.4.2.4 pre-article image planning controls") != 1:
        raise RuntimeError("v0.4.2.4 UI marker count is invalid")
    for name, tokens in CORE_REQUIRED.items():
        path = core / name
        if not path.is_file():
            raise RuntimeError(f"core file missing: {name}")
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token not in text:
                raise RuntimeError(f"{name} token missing: {token}")
    print("v0.4.2.4 validation OK")


if __name__ == "__main__":
    main()
