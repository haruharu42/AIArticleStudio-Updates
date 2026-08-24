from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import zipfile


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def apply_v0436_base(install: Path, package: Path) -> None:
    base_zip = package / "base" / "AIArticleStudio_Update_v0.4.3.6_AdminUserMode.zip"
    if not base_zip.is_file():
        raise RuntimeError("v0.4.3.6 cumulative base package is missing")
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        with zipfile.ZipFile(base_zip) as archive:
            if archive.testzip() is not None:
                raise RuntimeError("v0.4.3.6 cumulative base package is damaged")
            archive.extractall(base)
        subprocess.run(
            [sys.executable, str(base / "patch_v0436.py"), str(install), str(base)],
            check=True,
        )


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0437.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    init_file = install / "src" / "ai_article_studio" / "__init__.py"
    version = read_version(init_file)
    if version in {"0.4.3.4", "0.4.3.5"}:
        apply_v0436_base(install, package)

    source = package / "payload" / "ui" / "auth_ui.py"
    target = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
    if not source.is_file() or not target.is_file():
        raise RuntimeError("v0.4.3.7 auth UI payload or target is missing")
    text = source.read_text(encoding="utf-8")
    required = (
        'self.ui_mode = "admin"',
        "ADMIN USER MODE",
        "ユーザーモードへ",
        "管理者モードへ",
        'uniform="user_columns"',
        'self.ui_mode == "admin" and can_manage_users',
    )
    if not all(token in text for token in required):
        raise RuntimeError("v0.4.3.7 verified Admin UI payload is incomplete")
    compile(text, str(source), "exec")
    before = digest(target)
    shutil.copy2(source, target)
    after = digest(target)
    expected = digest(source)
    if after != expected:
        raise RuntimeError("installed auth_ui.py differs from the package payload")
    print(f"auth_ui.py before: {before}")
    print(f"auth_ui.py after : {after}")
    print("v0.4.3.7 verified Admin UI payload applied")


if __name__ == "__main__":
    main()
