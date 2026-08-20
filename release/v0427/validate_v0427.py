from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.2.7"
REQUIRED_APP = (
    "# v0.4.2.7 visual six-step article wizard",
    "from .guided_wizard_v0427 import install_article_wizard",
    "from .guided_wizard_v0427 import install_web_ai_wizard",
    "win = self._create_embedded_article_workspace()",
)
REQUIRED_MODULE = (
    "def install_article_wizard(app, body):",
    "def install_web_ai_wizard(app, win, req, pages, fields):",
    "完成記事を作る前の画像計画",
    "貼り付け欄をクリア",
    "画像プロンプト",
    "装飾",
    "STEP_LABELS",
)


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0427.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    module = app.parent / "guided_wizard_v0427.py"
    if not init_file.is_file() or not app.is_file() or not module.is_file():
        raise RuntimeError("canonical v0.4.2.7 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    module_text = module.read_text(encoding="utf-8")
    for token in REQUIRED_APP:
        if token not in app_text:
            raise RuntimeError(f"application token missing: {token}")
    for token in REQUIRED_MODULE:
        if token not in module_text:
            raise RuntimeError(f"wizard token missing: {token}")
    if app_text.count("# v0.4.2.7 visual six-step article wizard") != 1:
        raise RuntimeError("v0.4.2.7 marker count is invalid")
    if "Display one setup item at a time in the existing article-create page." in app_text:
        raise RuntimeError("legacy v0.4.2.6 outer wizard implementation remains active")
    if "Show one Web-AI production step at a time and provide local recent-history access." in app_text:
        raise RuntimeError("legacy Web AI wizard implementation remains active")
    compile(app_text, str(app), "exec")
    compile(module_text, str(module), "exec")
    print("v0.4.2.7 validation OK")


if __name__ == "__main__":
    main()
