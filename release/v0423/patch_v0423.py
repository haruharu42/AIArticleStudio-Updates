from __future__ import annotations

import shutil
import sys
from pathlib import Path

CORE_FILE = "image_prompt_builder.py"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0423.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    source = package / "payload" / "core" / CORE_FILE
    destination = install / "src" / "ai_article_studio" / "core" / CORE_FILE
    if not source.is_file():
        raise RuntimeError(f"required payload file missing: {source}")
    if not destination.parent.is_dir():
        raise RuntimeError(f"core directory missing: {destination.parent}")
    shutil.copy2(source, destination)
    print("v0.4.2.3 anime/manga style tuning applied")


if __name__ == "__main__":
    main()
