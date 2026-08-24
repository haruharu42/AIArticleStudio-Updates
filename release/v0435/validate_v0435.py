from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.3.5"


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0435.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    auth_ui = app.parent / "auth_ui.py"
    auth_core = app.parent.parent / "core" / "auth_service.py"
    migration = root / "supabase" / "migrations" / "202608240001_admin_user_management.sql"
    required = (init_file, app, auth_ui, auth_core, migration, app.parent / "guided_wizard_v0432.py")
    if not all(path.is_file() for path in required):
        raise RuntimeError("canonical v0.4.3.5 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    core_text = auth_core.read_text(encoding="utf-8")
    ui_text = auth_ui.read_text(encoding="utf-8")
    sql_text = migration.read_text(encoding="utf-8")
    for token in ("admin_list_users", "admin_set_user_status", "ManagedUserProfile", "cannot_suspend_self", "token?grant_type=pkce"):
        if token not in core_text:
            raise RuntimeError(f"auth core token is missing: {token}")
    for token in ("USER MANAGEMENT", "can_manage_users", "承認待ち", "利用中", "一時停止", "再開"):
        if token not in ui_text:
            raise RuntimeError(f"Admin GUI token is missing: {token}")
    for token in ("public.admin_list_users", "public.admin_set_user_status", "private.is_active_admin()", "public.admin_user_actions"):
        if token not in sql_text:
            raise RuntimeError(f"migration token is missing: {token}")
    for path in (app, auth_ui, auth_core, required[-1]):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    print("v0.4.3.5 validation OK")


if __name__ == "__main__":
    main()
