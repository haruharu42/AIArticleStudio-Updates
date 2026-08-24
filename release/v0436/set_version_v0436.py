from __future__ import annotations

import re
import sys
from pathlib import Path


VERSION = "0.4.3.6"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: set_version_v0436.py <install-root>")
    init_file = Path(sys.argv[1]) / "src" / "ai_article_studio" / "__init__.py"
    if not init_file.is_file():
        raise RuntimeError(f"version file not found: {init_file}")
    updated, count = re.subn(
        r'(?m)^__version__\s*=\s*["\'][^"\']+["\']\s*$',
        f'__version__ = "{VERSION}"',
        init_file.read_text(encoding="utf-8"),
        count=1,
    )
    if count != 1:
        raise RuntimeError("version assignment not found")
    init_file.write_text(updated, encoding="utf-8", newline="\n")
    print(f"version set to {VERSION}")


if __name__ == "__main__":
    main()
