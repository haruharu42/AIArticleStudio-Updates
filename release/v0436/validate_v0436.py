from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.3.6"


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0436.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    auth_ui = root / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
    auth_core = root / "src" / "ai_article_studio" / "core" / "auth_service.py"
    if not all(path.is_file() for path in (init_file, auth_ui, auth_core)):
        raise RuntimeError("canonical v0.4.3.6 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    text = auth_ui.read_text(encoding="utf-8")
    for token in (
        'self.ui_mode = "admin"', "ADMIN USER MODE", "ユーザーモードへ", "管理者モードへ",
        'uniform="user_columns"', 'self.ui_mode == "admin" and can_manage_users',
    ):
        if token not in text:
            raise RuntimeError(f"Admin User Mode token is missing: {token}")
    core_text = auth_core.read_text(encoding="utf-8")
    for token in ("admin_list_users", "admin_set_user_status", "token?grant_type=pkce"):
        if token not in core_text:
            raise RuntimeError(f"Auth regression token is missing: {token}")
    compile(text, str(auth_ui), "exec")
    print("v0.4.3.6 validation OK")


if __name__ == "__main__":
    main()
