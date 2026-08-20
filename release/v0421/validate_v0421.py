from __future__ import annotations
import sys
from pathlib import Path

VERSION = "0.4.2.1"
IMAGE_PACK = 'self.image_settings_card.pack(fill="x", pady=(0,12))'
WEB_PACK = 'self.web_settings_card.pack(fill="x", pady=(0,12))'


def read_version(init_file: Path) -> str:
    for line in init_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0421.py <install-root>")
    install = Path(sys.argv[1])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    init = install / "src" / "ai_article_studio" / "__init__.py"
    if not app.is_file() or not init.is_file():
        raise RuntimeError("canonical application files missing")
    text = app.read_text(encoding="utf-8")
    compile(text, str(app), "exec")
    if read_version(init) != VERSION:
        raise RuntimeError("version was not updated to v0.4.2.1")
    if text.count(IMAGE_PACK) != 1:
        raise RuntimeError("image settings card is not visibly packed exactly once")
    if "self.web_settings_card = self.card(body, bg=SURFACE_2)" in text and text.count(WEB_PACK) != 1:
        raise RuntimeError("Web AI settings card is not visibly packed exactly once")
    print("v0.4.2.1 validation OK")


if __name__ == "__main__":
    main()
