from __future__ import annotations

import shutil
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: cleanup_v0430.py <install-root>")
    root = Path(sys.argv[1]).resolve()
    source = (root / "src" / "ai_article_studio").resolve()
    if source.parent != (root / "src").resolve() or not source.is_dir():
        raise RuntimeError("safe application source directory was not found")
    removed_dirs = 0
    removed_files = 0
    for cache in sorted(source.rglob("__pycache__"), key=lambda path: len(path.parts), reverse=True):
        if cache.is_dir() and source in cache.parents:
            shutil.rmtree(cache)
            removed_dirs += 1
    for compiled in source.rglob("*.pyc"):
        if compiled.is_file() and source in compiled.parents:
            compiled.unlink()
            removed_files += 1
    print(f"safe cache cleanup: {removed_dirs} directories, {removed_files} files")
    print("article data, settings, history, and backups were preserved")


if __name__ == "__main__":
    main()
