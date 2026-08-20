from __future__ import annotations

import shutil
import sys
from pathlib import Path


VERSION = "0.4.2.8"
MARKER = "# v0.4.2.8 direct visual wizard activation"
PREVIOUS_MARKER = "# v0.4.2.7 visual six-step article wizard"
OLD_ARTICLE_CALL = "        self._install_single_item_article_wizard(body)\n"
NEW_ARTICLE_CALL = '''        from .guided_wizard_v0428 import install_article_wizard as install_visual_article_wizard
        install_visual_article_wizard(self, body)
'''
OLD_WEB_CALL = '''        self._install_web_ai_article_wizard(
            win,
'''
NEW_WEB_CALL = '''        from .guided_wizard_v0428 import install_web_ai_wizard as install_visual_web_ai_wizard
        install_visual_web_ai_wizard(
            self,
            win,
'''
PAYLOAD_MODULES = ("guided_wizard_v0427.py", "guided_wizard_v0428.py")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one active call site, got {count}")
    return text.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0428.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    ui_dir = app.parent
    payload_ui = package / "payload" / "ui"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    for name in PAYLOAD_MODULES:
        source = payload_ui / name
        if not source.is_file():
            raise RuntimeError(f"v0.4.2.8 payload is missing: {name}")
        compile(source.read_text(encoding="utf-8"), str(source), "exec")
    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        for name in PAYLOAD_MODULES:
            shutil.copy2(payload_ui / name, ui_dir / name)
        print("v0.4.2.8 direct visual wizard already applied")
        return
    if PREVIOUS_MARKER not in text:
        raise RuntimeError("v0.4.2.7 UI marker missing")
    text = replace_once(text, OLD_ARTICLE_CALL, NEW_ARTICLE_CALL, "article wizard direct activation")
    text = replace_once(text, OLD_WEB_CALL, NEW_WEB_CALL, "Web AI wizard direct activation")
    marker_anchor = "    # v0.4.2.7 visual six-step article wizard\n"
    if marker_anchor not in text:
        raise RuntimeError("v0.4.2.7 marker anchor missing")
    text = text.replace(marker_anchor, f"    {MARKER}\n" + marker_anchor, 1)
    compile(text, str(app), "exec")
    ui_dir.mkdir(parents=True, exist_ok=True)
    for name in PAYLOAD_MODULES:
        shutil.copy2(payload_ui / name, ui_dir / name)
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} direct visual wizard activation applied")


if __name__ == "__main__":
    main()
