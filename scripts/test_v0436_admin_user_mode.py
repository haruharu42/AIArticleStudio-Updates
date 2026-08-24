from __future__ import annotations

import pathlib
import re
import sys
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import AuthSession, AuthenticatedUser, UserProfile  # noqa: E402
from ai_article_studio.ui.auth_ui import ADMIN_ONLY_ROUTES, RoleShell  # noqa: E402


def authenticated(role="admin", status="active", user_id="admin-id", aas_id="AAS-000001"):
    return AuthenticatedUser(
        AuthSession("access", "refresh", time.time() + 3600, user_id, "user@example.com"),
        UserProfile(user_id, aas_id, "管理者", role, status, ""),
    )


def main() -> None:
    admin = authenticated()
    shell = RoleShell(object(), admin.profile, lambda: None, current_user=admin)
    assert shell.ui_mode == "admin"
    assert shell._can_switch_modes()
    assert admin.profile.role == "admin"

    user = authenticated("user", "active", "user-id", "AAS-000002")
    user_shell = RoleShell(object(), user.profile, lambda: None, current_user=user)
    assert user_shell.ui_mode == "user"
    assert not user_shell._can_switch_modes()

    suspended_admin = authenticated("admin", "suspended")
    suspended_shell = RoleShell(object(), suspended_admin.profile, lambda: None, current_user=suspended_admin)
    assert suspended_shell.ui_mode == "user"
    assert not suspended_shell._can_switch_modes()
    assert {"dashboard", "users", "articles", "licenses", "diagnostics"} <= ADMIN_ONLY_ROUTES

    source = (ROOT / "src" / "ai_article_studio" / "ui" / "auth_ui.py").read_text(encoding="utf-8")
    assert re.search(r"profile\.role\s*=(?!=)", source) is None
    assert re.search(r"profile\.status\s*=(?!=)", source) is None
    assert "ADMIN USER MODE" in source
    assert "管理者モードへ" in source
    print("V0.4.3.6 ADMIN USER MODE TESTS OK")


if __name__ == "__main__":
    main()
