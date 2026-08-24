from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    import patch_v0434
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "v0434"))
    import patch_v0434


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0435.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    original_argv = sys.argv
    try:
        sys.argv = [str(package / "patch_v0434.py"), str(install), str(package)]
        patch_v0434.main()
    finally:
        sys.argv = original_argv

    migration = package / "payload" / "supabase" / "migrations" / "202608240001_admin_user_management.sql"
    if not migration.is_file():
        raise RuntimeError("v0.4.3.5 admin user management migration is missing")
    migration_target = install / "supabase" / "migrations"
    migration_target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(migration, migration_target / migration.name)

    auth_core = install / "src" / "ai_article_studio" / "core" / "auth_service.py"
    auth_ui = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
    core_text = auth_core.read_text(encoding="utf-8")
    ui_text = auth_ui.read_text(encoding="utf-8")
    sql_text = migration.read_text(encoding="utf-8")
    required = (
        (core_text, "admin_list_users"),
        (core_text, "admin_set_user_status"),
        (core_text, "cannot_suspend_self"),
        (ui_text, "USER MANAGEMENT"),
        (ui_text, "can_manage_users"),
        (ui_text, "承認待ち"),
        (sql_text, "public.admin_list_users"),
        (sql_text, "public.admin_set_user_status"),
        (sql_text, "public.admin_user_actions"),
    )
    if not all(token in text for text, token in required):
        raise RuntimeError("v0.4.3.5 Admin user management payload is incomplete")
    print("v0.4.3.5 Admin user management applied")


if __name__ == "__main__":
    main()
