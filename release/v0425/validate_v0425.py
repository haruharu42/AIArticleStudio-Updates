from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.2.5"
APP_REQUIRED = (
    "# v0.4.2.5 guided article wizard and recent history",
    "def _install_create_step_wizard(self, body):",
    "def _install_web_ai_article_wizard(self, win, req, pages, fields):",
    'self._secondary_button(footer, "貼り付け欄をクリア", clear_paste)',
    'self._secondary_button(footer, "新しい記事", new_article)',
    '"最近の作業（最大10件）"',
    "self._install_create_step_wizard(body)",
    "self._install_web_ai_article_wizard(",
)
CORE_REQUIRED = {
    "web_ai_state.py": (
        "DEFAULT_HISTORY_LIMIT = 10",
        "def recent_summaries",
        "def load_history",
        "def start_new",
        "def clear_article_content",
        'with_name("web_ai_workflow_history.json")',
    ),
    "web_ai_ui_bridge.py": (
        "def history_items",
        "def load_history",
        "def delete_history",
        "def new_article",
        "def clear_article_content",
        "def save_editor_draft",
    ),
}


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0425.py <install-root>")
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
    if app_text.count("# v0.4.2.5 guided article wizard and recent history") != 1:
        raise RuntimeError("v0.4.2.5 UI marker count is invalid")
    for name, tokens in CORE_REQUIRED.items():
        path = core / name
        if not path.is_file():
            raise RuntimeError(f"core file missing: {name}")
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token not in text:
                raise RuntimeError(f"{name} token missing: {token}")
    print("v0.4.2.5 validation OK")


if __name__ == "__main__":
    main()
