from __future__ import annotations

import shutil
import sys
from pathlib import Path


VERSION = "0.4.3.0"
PAYLOAD_MODULES = (
    "guided_wizard_v0427.py",
    "guided_wizard_v0428.py",
    "guided_wizard_v0429.py",
)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0430.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    ui_dir = install / "src" / "ai_article_studio" / "ui"
    payload_ui = package / "payload" / "ui"
    app = ui_dir / "app.py"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    app_text = app.read_text(encoding="utf-8")
    if "# v0.4.2.9 live show_create activation hook" not in app_text:
        raise RuntimeError("v0.4.2.9 live activation hook missing")
    for name in PAYLOAD_MODULES:
        source = payload_ui / name
        if not source.is_file():
            raise RuntimeError(f"v0.4.3.0 payload is missing: {name}")
        text = source.read_text(encoding="utf-8")
        compile(text, str(source), "exec")
    source27 = (payload_ui / "guided_wizard_v0427.py").read_text(encoding="utf-8")
    required = (
        'text="AIおまかせ"',
        'app._v0430_theme_auto = theme_auto',
        'app._v0430_creation_action = text',
        'button.invoke()',
    )
    if not all(token in source27 for token in required):
        raise RuntimeError("v0.4.3.0 creation-flow payload is incomplete")
    ui_dir.mkdir(parents=True, exist_ok=True)
    for name in PAYLOAD_MODULES:
        shutil.copy2(payload_ui / name, ui_dir / name)
    print(f"v{VERSION} step-five transition and AI-auto theme applied")


if __name__ == "__main__":
    main()
