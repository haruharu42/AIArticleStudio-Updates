from __future__ import annotations

import shutil
import sys
from pathlib import Path


VERSION = "0.4.3.2"
MARKER = "# v0.4.3.2 embedded six-step creation flow"
HOOK_OLDS = (
    "from .guided_wizard_v0429 import activate_live_article_wizard",
    "from .guided_wizard_v0431 import activate_live_article_wizard",
)
HOOK_NEW = "from .guided_wizard_v0432 import activate_live_article_wizard"
ANCHOR = "    # v0.4.2.9 live show_create activation hook\n"
CORE_MODULES = ("article_publish_text.py", "web_ai_workflow.py", "web_ai_ui_bridge.py", "image_prompt_builder.py")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0432.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    ui_dir = install / "src" / "ai_article_studio" / "ui"
    app = ui_dir / "app.py"
    payload_ui = package / "payload" / "ui"
    payload_core = package / "payload" / "core"
    source32 = payload_ui / "guided_wizard_v0432.py"
    source27 = payload_ui / "guided_wizard_v0427.py"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    sources = (source27, source32, *(payload_core / name for name in CORE_MODULES))
    for source in sources:
        if not source.is_file():
            raise RuntimeError(f"v0.4.3.2 payload is missing: {source.name}")
        compile(source.read_text(encoding="utf-8"), str(source), "exec")
    source_text = source32.read_text(encoding="utf-8")
    required = (
        'ACTIVATION_MARKER = "v0.4.3.2-publish-safe-copy"',
        '"pages": pages',
        'len(wizard.get("pages") or ()) != 6',
        'bridge.build_title_step',
        'app.web_ai_bridge.build_article_step',
        'app.web_ai_bridge.ingest_step',
        'app.web_ai_bridge.publish_step',
        '"画像差し込み用"',
        '"元記事"',
        '"v0432_marker"',
    )
    if not all(token in source_text for token in required):
        raise RuntimeError("v0.4.3.2 embedded-flow payload is incomplete")
    text = app.read_text(encoding="utf-8")
    if MARKER not in text:
        if ANCHOR not in text or text.count(ANCHOR) != 1:
            raise RuntimeError("canonical v0.4.2.9 hook anchor is missing")
        hooks = [hook for hook in HOOK_OLDS if hook in text]
        if len(hooks) != 1 or text.count(hooks[0]) != 1:
            raise RuntimeError("canonical live activation import is missing")
        text = text.replace(hooks[0], HOOK_NEW, 1)
        text = text.replace(ANCHOR, f"    {MARKER}\n" + ANCHOR, 1)
    elif HOOK_NEW not in text:
        raise RuntimeError("v0.4.3.2 marker exists without the embedded activation import")
    compile(text, str(app), "exec")
    ui_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source27, ui_dir / source27.name)
    shutil.copy2(source32, ui_dir / source32.name)
    core_dir = ui_dir.parent / "core"
    core_dir.mkdir(parents=True, exist_ok=True)
    for name in CORE_MODULES:
        shutil.copy2(payload_core / name, core_dir / name)
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} embedded six-step creation flow applied")


if __name__ == "__main__":
    main()
