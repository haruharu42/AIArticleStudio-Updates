from __future__ import annotations

import shutil
import sys
from pathlib import Path


VERSION = "0.4.2.9"
MARKER = "# v0.4.2.9 live show_create activation hook"
PREVIOUS_MARKER = "# v0.4.2.8 direct visual wizard activation"
PAYLOAD_MODULES = (
    "guided_wizard_v0427.py",
    "guided_wizard_v0428.py",
    "guided_wizard_v0429.py",
)

LIVE_HOOK = r'''    # v0.4.2.9 live show_create activation hook
    _v0429_original_show_create = show_create

    def _v0429_activate_after_show_create(self):
        """Replace the widgets created by the real Article Creator navigation event."""
        from .guided_wizard_v0429 import activate_live_article_wizard
        try:
            activate_live_article_wizard(self)
        except Exception as exc:
            self._v0429_live_wizard_active = False
            self._v0429_activation_error = f"{type(exc).__name__}: {exc}"

    def show_create(self, *args, **kwargs):
        result = self._v0429_original_show_create(*args, **kwargs)
        try:
            self.after_idle(self._v0429_activate_after_show_create)
        except Exception:
            self._v0429_activate_after_show_create()
        return result

'''


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0429.py <install-root> <package-root>")
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
            raise RuntimeError(f"v0.4.2.9 payload is missing: {name}")
        compile(source.read_text(encoding="utf-8"), str(source), "exec")
    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        for name in PAYLOAD_MODULES:
            shutil.copy2(payload_ui / name, ui_dir / name)
        print("v0.4.2.9 live Article Creator hook already applied")
        return
    if PREVIOUS_MARKER not in text:
        raise RuntimeError("v0.4.2.8 UI marker missing")
    if "    def show_create(" not in text:
        raise RuntimeError("live show_create method missing")
    if text.count(PREVIOUS_MARKER) != 1:
        raise RuntimeError("v0.4.2.8 marker is not canonical")
    text = text.replace(f"    {PREVIOUS_MARKER}\n", LIVE_HOOK + f"    {PREVIOUS_MARKER}\n", 1)
    compile(text, str(app), "exec")
    for name in PAYLOAD_MODULES:
        shutil.copy2(payload_ui / name, ui_dir / name)
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} live Article Creator activation hook applied")


if __name__ == "__main__":
    main()
