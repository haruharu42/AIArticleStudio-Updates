from __future__ import annotations

import shutil
import sys
from pathlib import Path


VERSION = "0.4.3.1"
MARKER = "# v0.4.3.1 embedded six-step creation flow"
HOOK_OLD = "from .guided_wizard_v0429 import activate_live_article_wizard"
HOOK_NEW = "from .guided_wizard_v0431 import activate_live_article_wizard"
ANCHOR = "    # v0.4.2.9 live show_create activation hook\n"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0431.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    ui_dir = install / "src" / "ai_article_studio" / "ui"
    app = ui_dir / "app.py"
    payload_ui = package / "payload" / "ui"
    source31 = payload_ui / "guided_wizard_v0431.py"
    source27 = payload_ui / "guided_wizard_v0427.py"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    for source in (source27, source31):
        if not source.is_file():
            raise RuntimeError(f"v0.4.3.1 payload is missing: {source.name}")
        compile(source.read_text(encoding="utf-8"), str(source), "exec")
    source_text = source31.read_text(encoding="utf-8")
    required = (
        'ACTIVATION_MARKER = "v0.4.3.1-embedded-six-step-flow"',
        '"pages": pages',
        'len(wizard.get("pages") or ()) != 6',
        'bridge.build_title_step',
        'app.web_ai_bridge.build_article_step',
        'app.web_ai_bridge.ingest_step',
        'app.web_ai_bridge.publish_step',
    )
    if not all(token in source_text for token in required):
        raise RuntimeError("v0.4.3.1 embedded-flow payload is incomplete")
    text = app.read_text(encoding="utf-8")
    if MARKER not in text:
        if ANCHOR not in text or text.count(ANCHOR) != 1:
            raise RuntimeError("canonical v0.4.2.9 hook anchor is missing")
        if HOOK_OLD not in text or text.count(HOOK_OLD) != 1:
            raise RuntimeError("canonical live activation import is missing")
        text = text.replace(HOOK_OLD, HOOK_NEW, 1)
        text = text.replace(ANCHOR, f"    {MARKER}\n" + ANCHOR, 1)
    elif HOOK_NEW not in text:
        raise RuntimeError("v0.4.3.1 marker exists without the embedded activation import")
    compile(text, str(app), "exec")
    ui_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source27, ui_dir / source27.name)
    shutil.copy2(source31, ui_dir / source31.name)
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} embedded six-step creation flow applied")


if __name__ == "__main__":
    main()
