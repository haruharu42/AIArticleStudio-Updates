from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.2.8"
REQUIRED_APP = (
    "# v0.4.2.8 direct visual wizard activation",
    "from .guided_wizard_v0428 import install_article_wizard as install_visual_article_wizard",
    "install_visual_article_wizard(self, body)",
    "from .guided_wizard_v0428 import install_web_ai_wizard as install_visual_web_ai_wizard",
    "install_visual_web_ai_wizard(\n            self,\n            win,",
)
REQUIRED_V0428 = (
    "ACTIVATION_MARKER",
    "def _hide_legacy_chrome(app, body):",
    "def install_article_wizard(app, body):",
    "def install_web_ai_wizard(app, win, req, pages, fields):",
    "_v0428_visual_wizard_active",
)


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0428.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    module27 = app.parent / "guided_wizard_v0427.py"
    module28 = app.parent / "guided_wizard_v0428.py"
    if not all(path.is_file() for path in (init_file, app, module27, module28)):
        raise RuntimeError("canonical v0.4.2.8 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    text27 = module27.read_text(encoding="utf-8")
    text28 = module28.read_text(encoding="utf-8")
    for token in REQUIRED_APP:
        if token not in app_text:
            raise RuntimeError(f"application token missing: {token}")
    for token in REQUIRED_V0428:
        if token not in text28:
            raise RuntimeError(f"direct wizard token missing: {token}")
    if "        self._install_single_item_article_wizard(body)\n" in app_text:
        raise RuntimeError("legacy article wizard call is still active")
    if "        self._install_web_ai_article_wizard(\n            win,\n" in app_text:
        raise RuntimeError("legacy Web AI wizard call is still active")
    if "grid_columnconfigure((0, 1, 2)" in text27:
        raise RuntimeError("unsupported multi-column Tk call remains")
    compile(app_text, str(app), "exec")
    compile(text27, str(module27), "exec")
    compile(text28, str(module28), "exec")
    print("v0.4.2.8 validation OK")


if __name__ == "__main__":
    main()
