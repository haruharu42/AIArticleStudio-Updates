from __future__ import annotations

import sys
from pathlib import Path

IMAGE_ANCHOR = "        self.image_settings_card = self.card(body, bg=SURFACE_2)\n"
IMAGE_PACK = "        self.image_settings_card.pack(fill=\"x\", pady=(0,12))\n"
WEB_ANCHOR = "        self.web_settings_card = self.card(body, bg=SURFACE_2)\n"
WEB_PACK = "        self.web_settings_card.pack(fill=\"x\", pady=(0,12))\n"


def ensure_pack(text: str, anchor: str, pack_line: str, label: str, *, required: bool) -> str:
    if pack_line in text:
        return text
    count = text.count(anchor)
    if count == 0 and not required:
        return text
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {count}")
    return text.replace(anchor, anchor + pack_line, 1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_v0421.py <install-root>")
    install = Path(sys.argv[1])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")

    text = app.read_text(encoding="utf-8")
    text = ensure_pack(text, IMAGE_ANCHOR, IMAGE_PACK, "image settings card", required=True)
    # v0.4.0 introduced the Web AI settings card with the same missing pack issue.
    # Fix it when present so beginner-facing settings are actually visible too.
    text = ensure_pack(text, WEB_ANCHOR, WEB_PACK, "web settings card", required=False)
    app.write_text(text, encoding="utf-8", newline="\n")
    print("v0.4.2.1 UI visibility hotfix applied")


if __name__ == "__main__":
    main()
