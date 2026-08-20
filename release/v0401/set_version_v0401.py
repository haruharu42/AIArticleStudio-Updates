from __future__ import annotations

import sys
from pathlib import Path

VERSION = "0.4.0.1"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: set_version_v0401.py <AIArticleStudio install root>")
    root = Path(sys.argv[1])
    init = root / "src" / "ai_article_studio" / "__init__.py"
    if not init.is_file():
        raise RuntimeError(f"version file not found: {init}")
    init.write_text(f'__version__ = "{VERSION}"\n', encoding="utf-8", newline="\n")
    print(f"VERSION SET {VERSION}")


if __name__ == "__main__":
    main()
