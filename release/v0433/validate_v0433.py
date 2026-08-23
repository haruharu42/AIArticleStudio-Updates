from __future__ import annotations

import sys
from pathlib import Path


VERSION = "0.4.3.3"


def read_version(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("__version__") and "=" in line:
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_v0433.py <install-root>")
    root = Path(sys.argv[1])
    init_file = root / "src" / "ai_article_studio" / "__init__.py"
    app = root / "src" / "ai_article_studio" / "ui" / "app.py"
    auth_ui = app.parent / "auth_ui.py"
    auth_core = app.parent.parent / "core" / "auth_service.py"
    wizard27 = app.parent / "guided_wizard_v0427.py"
    wizard32 = app.parent / "guided_wizard_v0432.py"
    cumulative_core = [app.parent.parent / "core" / name for name in (
        "article_publish_text.py", "web_ai_workflow.py", "web_ai_ui_bridge.py", "image_prompt_builder.py"
    )]
    migration = root / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql"
    required = (init_file, app, wizard27, wizard32, *cumulative_core, auth_ui, auth_core, migration)
    if not all(path.is_file() for path in required):
        raise RuntimeError("canonical v0.4.3.3 files are missing")
    if read_version(init_file) != VERSION:
        raise RuntimeError(f"installed version is not {VERSION}")
    app_text = app.read_text(encoding="utf-8")
    if app_text.count("# v0.4.3.3 Auth/UI Foundation") != 1:
        raise RuntimeError("v0.4.3.3 auth hook is missing or duplicated")
    for token in (
        "_v0433_original_init = __init__",
        "from .auth_ui import install_auth_foundation",
        "install_auth_foundation(self)",
        "from .guided_wizard_v0432 import activate_live_article_wizard",
    ):
        if token not in app_text:
            raise RuntimeError(f"application hook token is missing: {token}")
    ui_text = auth_ui.read_text(encoding="utf-8")
    core_text = auth_core.read_text(encoding="utf-8")
    sql_text = migration.read_text(encoding="utf-8")
    for token in ("Email", "Password", "Googleでログイン", "パスワードを忘れた方", "USER_MENU", "ADMIN_MENU"):
        if token not in ui_text:
            raise RuntimeError(f"auth UI token is missing: {token}")
    for token in ("WindowsDPAPIProtector", "sign_in_with_password", "sign_in_with_google", "request_password_reset"):
        if token not in core_text:
            raise RuntimeError(f"auth core token is missing: {token}")
    for token in ("enable row level security", "profiles_select_self_or_admin", "private.is_active_admin"):
        if token not in sql_text:
            raise RuntimeError(f"migration token is missing: {token}")
    wizard_text = wizard32.read_text(encoding="utf-8")
    for token in ('ACTIVATION_MARKER = "v0.4.3.2-publish-safe-copy"', 'len(wizard.get("pages") or ()) != 6'):
        if token not in wizard_text:
            raise RuntimeError(f"cumulative wizard token is missing: {token}")
    for path in (app, wizard27, wizard32, *cumulative_core, auth_ui, auth_core):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    print("v0.4.3.3 validation OK")


if __name__ == "__main__":
    main()
