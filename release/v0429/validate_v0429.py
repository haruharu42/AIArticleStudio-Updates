from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.2.9"
REQUIRED_APP = (
    "# v0.4.2.9 live show_create activation hook",
    "_v0429_original_show_create = show_create",
    "def _v0429_activate_after_show_create(self):",
    "from .guided_wizard_v0429 import activate_live_article_wizard",
    "self.after_idle(self._v0429_activate_after_show_create)",
)
REQUIRED_MODULE = (
    "ACTIVATION_MARKER",
    "def find_live_article_body(app):",
    "def activate_live_article_wizard(app):",
    "live_article_body_not_found",
    "_v0429_live_wizard_active",
)


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0429.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    modules = [app.parent / f"guided_wizard_v042{number}.py" for number in (7, 8, 9)]
    if not all(path.is_file() for path in (init_file, app, *modules)):
        raise RuntimeError("canonical v0.4.2.9 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    module_text = modules[-1].read_text(encoding="utf-8")
    for token in REQUIRED_APP:
        if token not in app_text:
            raise RuntimeError(f"application token missing: {token}")
    for token in REQUIRED_MODULE:
        if token not in module_text:
            raise RuntimeError(f"live activation token missing: {token}")
    if app_text.count("# v0.4.2.9 live show_create activation hook") != 1:
        raise RuntimeError("live hook marker count is invalid")
    compile(app_text, str(app), "exec")
    for module in modules:
        compile(module.read_text(encoding="utf-8"), str(module), "exec")
    print("v0.4.2.9 validation OK")


if __name__ == "__main__":
    main()
