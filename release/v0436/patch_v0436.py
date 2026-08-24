from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import zipfile


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0436.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    init_file = install / "src" / "ai_article_studio" / "__init__.py"
    if read_version(init_file) == "0.4.3.4":
        base_zip = package / "base" / "AIArticleStudio_Update_v0.4.3.5_AdminUserManagement.zip"
        if not base_zip.is_file():
            raise RuntimeError("v0.4.3.5 cumulative base package is missing")
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            with zipfile.ZipFile(base_zip) as archive:
                if archive.testzip() is not None:
                    raise RuntimeError("v0.4.3.5 cumulative base package is damaged")
                archive.extractall(base)
            subprocess.run(
                [sys.executable, str(base / "patch_v0435.py"), str(install), str(base)],
                check=True,
            )
    source = package / "payload" / "ui" / "auth_ui.py"
    target = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
    if not source.is_file() or not target.is_file():
        raise RuntimeError("v0.4.3.6 auth UI payload or target is missing")
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
        raise RuntimeError("v0.4.3.6 Admin User Mode payload is incomplete")
    compile(text, str(source), "exec")
    shutil.copy2(source, target)
    print("v0.4.3.6 Admin action-button layout and User Mode applied")


if __name__ == "__main__":
    main()
