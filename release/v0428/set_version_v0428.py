from __future__ import annotations

import re
import sys
from pathlib import Path


VERSION = "0.4.2.8"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: set_version_v0428.py <install-root>")
    init_file = Path(sys.argv[1]) / "src" / "ai_article_studio" / "__init__.py"
    if not init_file.is_file():
        raise RuntimeError("version file not found")
    text = init_file.read_text(encoding="utf-8")
    updated, count = re.subn(r'(?m)^__version__\s*=\s*["\'][^"\']+["\']\s*$', f'__version__ = "{VERSION}"', text, count=1)
    if count != 1:
        raise RuntimeError("version declaration was not found")
    init_file.write_text(updated, encoding="utf-8", newline="\n")
    print(f"version set to {VERSION}")


if __name__ == "__main__":
    main()
