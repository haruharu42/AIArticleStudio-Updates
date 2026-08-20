from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.2.6"
REQUIRED = (
    "# v0.4.2.6 embedded single-item article wizard",
    "def _install_single_item_article_wizard(self, body):",
    "def _create_embedded_article_workspace(self):",
    "def _restore_article_setup(self):",
    "生成方法を選択",
    "完成記事を作る前の画像計画",
    "1項目ずつ設定します",
    "同じ記事作成画面の中で進行しています",
    "win = self._create_embedded_article_workspace()",
    "self._install_single_item_article_wizard(body)",
)


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0426.py <install-root>")
    root = Path(sys.argv[1])
    init = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    if not init.is_file() or not app.is_file():
        raise RuntimeError("canonical application files missing")
    if read_version(init) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    text = app.read_text(encoding="utf-8")
    for token in REQUIRED:
        if token not in text:
            raise RuntimeError(f"application token missing: {token}")
    if text.count("# v0.4.2.6 embedded single-item article wizard") != 1:
        raise RuntimeError("v0.4.2.6 UI marker count is invalid")
    if "        self._install_create_step_wizard(body)\n" in text:
        raise RuntimeError("v0.4.2.5 grouped setup wizard is still active")
    start = text.find("    def _open_web_ai_mode(self):\n")
    end = text.find("\n    def ", start + 5)
    method = text[start : (end if end >= 0 else len(text))]
    if "tk.Toplevel(self)" in method:
        raise RuntimeError("Web AI workflow still opens a separate Toplevel")
    compile(text, str(app), "exec")
    print("v0.4.2.6 validation OK")


if __name__ == "__main__":
    main()
