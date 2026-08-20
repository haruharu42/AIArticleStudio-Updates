from __future__ import annotations

import sys
from pathlib import Path

VERSION = "0.4.2.4"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: set_version_v0424.py <install-root>")
    init_file = Path(sys.argv[1]) / "src" / "ai_article_studio" / "__init__.py"
    if not init_file.is_file():
        raise RuntimeError(f"version file not found: {init_file}")
    init_file.write_text(f'__version__ = "{VERSION}"\n', encoding="utf-8", newline="\n")
    print(f"version set to {VERSION}")


if __name__ == "__main__":
    main()
