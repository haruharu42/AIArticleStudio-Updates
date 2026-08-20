from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path


VERSION = "0.4.2.7"
MARKER = "# v0.4.2.7 visual six-step article wizard"
PREVIOUS_MARKER = "# v0.4.2.6 embedded single-item article wizard"


ARTICLE_WRAPPER = '''    def _install_single_item_article_wizard(self, body):
        """Install the v0.4.2.7 dedicated visual article wizard."""
        from .guided_wizard_v0427 import install_article_wizard
        return install_article_wizard(self, body)

'''


WEB_WRAPPER = '''    def _install_web_ai_article_wizard(self, win, req, pages, fields):
        """Install the v0.4.2.7 embedded Web AI wizard."""
        from .guided_wizard_v0427 import install_web_ai_wizard
        return install_web_ai_wizard(self, win, req, pages, fields)

'''


def replace_method(text: str, name: str, replacement: str) -> str:
    pattern = rf"    def {re.escape(name)}\(.*?(?=\n    def |\Z)"
    updated, count = re.subn(pattern, replacement.rstrip(), text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"method replacement failed: {name} ({count})")
    return updated


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0427.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    ui_dir = app.parent
    payload_module = package / "payload" / "ui" / "guided_wizard_v0427.py"
    target_module = ui_dir / "guided_wizard_v0427.py"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    if not payload_module.is_file():
        raise RuntimeError("v0.4.2.7 wizard payload is missing")
    compile(payload_module.read_text(encoding="utf-8"), str(payload_module), "exec")
    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        if not target_module.is_file():
            shutil.copy2(payload_module, target_module)
        print("v0.4.2.7 visual wizard already applied")
        return
    if PREVIOUS_MARKER not in text:
        raise RuntimeError("v0.4.2.6 UI marker missing")
    text = replace_method(text, "_install_single_item_article_wizard", ARTICLE_WRAPPER)
    text = replace_method(text, "_install_web_ai_article_wizard", WEB_WRAPPER)
    marker_anchor = "    # v0.4.2.6 embedded single-item article wizard\n"
    if marker_anchor not in text:
        raise RuntimeError("v0.4.2.6 marker anchor missing")
    text = text.replace(marker_anchor, f"    {MARKER}\n" + marker_anchor, 1)
    compile(text, str(app), "exec")
    ui_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(payload_module, target_module)
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} visual six-step article wizard applied")


if __name__ == "__main__":
    main()
