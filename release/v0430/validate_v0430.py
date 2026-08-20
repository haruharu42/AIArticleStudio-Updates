from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.3.0"
REQUIRED_V0427 = (
    'text="AIおまかせ"',
    '("theme_ai_auto",)',
    'app._v0430_theme_editor = editor',
    'app._v0430_theme_auto = theme_auto',
    'lambda text: "Web版AI" in text and "作成" in text',
    'app._v0430_creation_action = text',
    'button.invoke()',
    'app._v0430_creation_action = "direct_web_fallback"',
)


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0430.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    modules = [app.parent / f"guided_wizard_v042{number}.py" for number in (7, 8, 9)]
    if not all(path.is_file() for path in (init_file, app, *modules)):
        raise RuntimeError("canonical v0.4.3.0 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    if "# v0.4.2.9 live show_create activation hook" not in app_text:
        raise RuntimeError("live Article Creator activation hook is missing")
    text27 = modules[0].read_text(encoding="utf-8")
    for token in REQUIRED_V0427:
        if token not in text27:
            raise RuntimeError(f"step-five or AI-auto token missing: {token}")
    compile(app_text, str(app), "exec")
    for module in modules:
        compile(module.read_text(encoding="utf-8"), str(module), "exec")
    print("v0.4.3.0 validation OK")


if __name__ == "__main__":
    main()
