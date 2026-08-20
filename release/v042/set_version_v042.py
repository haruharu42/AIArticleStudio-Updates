from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: set_version_v042.py <install-root>")
    root = Path(sys.argv[1])
    init = root / "src" / "ai_article_studio" / "__init__.py"
    if not init.is_file():
        raise RuntimeError(f"version file not found: {init}")
    init.write_text('__version__ = "0.4.2"\n', encoding="utf-8", newline="\n")
    print("VERSION SET 0.4.2")


if __name__ == "__main__":
    main()
