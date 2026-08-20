from __future__ import annotations

import sys
from pathlib import Path

VERSION = "0.4.2.3"
REQUIRED_TOKENS = (
    "STYLE_RULES",
    "日本の現代的な2Dアニメ調",
    "セル塗り",
    "フォトリアル",
    "企業広告イラスト",
    "コマ割り",
    "やさしい商用イラスト風",
)


def read_version(init_file: Path) -> str:
    text = init_file.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0423.py <install-root>")
    root = Path(sys.argv[1])
    init = root / "src" / "ai_article_studio" / "__init__.py"
    prompt = root / "src" / "ai_article_studio" / "core" / "image_prompt_builder.py"
    if not init.is_file() or not prompt.is_file():
        raise RuntimeError("canonical files missing")
    if read_version(init) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    text = prompt.read_text(encoding="utf-8")
    for token in REQUIRED_TOKENS:
        if token not in text:
            raise RuntimeError(f"image prompt builder token missing: {token}")
    print("v0.4.2.3 validation OK")


if __name__ == "__main__":
    main()
