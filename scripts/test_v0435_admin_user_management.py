from __future__ import annotations

import pathlib
import sys
import tempfile
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthConfig,
    AuthError,
    AuthSession,
    AuthenticatedUser,
    ManagedUserProfile,
    SessionStore,
    SupabaseAuthService,
    UserProfile,
)
from ai_article_studio.ui.auth_ui import can_manage_users  # noqa: E402


class FakeProtector:
    def protect(self, data: bytes) -> bytes:
        return b"protected:" + data[::-1]

    def unprotect(self, data: bytes) -> bytes:
        return data[len(b"protected:") :][::-1]


class FakeHttp:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def request_json(self, method, url, *, headers=None, body=None, timeout=20.0):
        self.calls.append({"method": method, "url": url, "headers": dict(headers or {}), "body": body})
        if not self.responses:
            raise AssertionError(f"unexpected request: {method} {url}")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def authenticated(role: str = "admin", status: str = "active", user_id: str = "admin-id", aas_id: str = "AAS-000001") -> AuthenticatedUser:
    session = AuthSession("access-token", "refresh-token", time.time() + 3600, user_id, "admin@example.com")
    profile = UserProfile(user_id, aas_id, "管理者", role, status, "2026-08-23T00:00:00Z")
    return AuthenticatedUser(session, profile)


def managed(user_id: str, aas_id: str, status: str, role: str = "user") -> ManagedUserProfile:
    return ManagedUserProfile(user_id, aas_id, "テストユーザー", role, status, "2026-08-24T00:00:00Z")


def service(http: FakeHttp) -> SupabaseAuthService:
    tmp = tempfile.TemporaryDirectory()
    instance = SupabaseAuthService(
        AuthConfig("https://project.supabase.co", "publishable-key"),
        SessionStore(pathlib.Path(tmp.name) / "session.bin", FakeProtector()),
        http,
    )
    instance._test_tmp = tmp
    return instance


def test_list_pending_first_and_search() -> None:
    payload = [
        {"id": "pending-id", "aas_user_id": "AAS-000002", "display_name": "承認待ち", "role": "user", "status": "pending", "created_at": "2026-08-24T00:00:00Z"},
        {"id": "active-id", "aas_user_id": "AAS-000003", "display_name": "利用中", "role": "user", "status": "active", "created_at": "2026-08-23T00:00:00Z"},
    ]
    http = FakeHttp(payload)
    users = service(http).admin_list_users(authenticated(), "AAS-000002")
    assert [user.status for user in users] == ["pending", "active"]
    call = http.calls[0]
    assert call["url"].endswith("/rest/v1/rpc/admin_list_users")
    assert call["body"] == {"p_aas_user_id": "AAS-000002"}
    assert call["headers"]["Authorization"] == "Bearer access-token"


def test_allowed_status_transitions() -> None:
    cases = (
        (managed("pending-id", "AAS-000002", "pending"), "active", "approve"),
        (managed("active-id", "AAS-000003", "active"), "suspended", "suspend"),
        (managed("paused-id", "AAS-000004", "suspended"), "active", "reactivate"),
    )
    for target, new_status, expected_action in cases:
        response = [{**target.__dict__, "status": new_status}]
        http = FakeHttp(response)
        updated = service(http).admin_set_user_status(authenticated(), target, new_status)
        assert updated.status == new_status
        assert http.calls[0]["body"] == {"p_target_user_id": target.id, "p_new_status": new_status}
        assert expected_action in {"approve", "suspend", "reactivate"}


def test_client_side_admin_and_self_protection() -> None:
    target = managed("target-id", "AAS-000002", "pending")
    for caller in (authenticated("user", "active"), authenticated("admin", "suspended")):
        http = FakeHttp([])
        try:
            service(http).admin_list_users(caller)
        except AuthError as exc:
            assert exc.code == "admin_required"
        else:
            raise AssertionError("non-active admins must be rejected")
        assert http.calls == []

    current = authenticated()
    self_target = managed(current.session.user_id, current.profile.aas_user_id, "active", role="admin")
    http = FakeHttp([])
    try:
        service(http).admin_set_user_status(current, self_target, "suspended")
    except AuthError as exc:
        assert exc.code == "cannot_suspend_self"
    else:
        raise AssertionError("the current admin must not suspend itself")
    assert http.calls == []

    for invalid in ("disabled", "pending", "admin", "unknown"):
        http = FakeHttp([])
        try:
            service(http).admin_set_user_status(current, target, invalid)
        except AuthError as exc:
            assert exc.code in {"invalid_status", "invalid_status_transition"}
        else:
            raise AssertionError("invalid status must be rejected")
        assert http.calls == []


def test_user_admin_ui_boundary() -> None:
    admin = authenticated()
    assert can_manage_users(admin.profile, admin)
    assert not can_manage_users(authenticated("user", "active").profile, authenticated("user", "active"))
    assert not can_manage_users(authenticated("admin", "suspended").profile, authenticated("admin", "suspended"))
    assert not can_manage_users(UserProfile.local_user(), None)


def test_migration_security_contract() -> None:
    sql = (ROOT / "supabase" / "migrations" / "202608240001_admin_user_management.sql").read_text(encoding="utf-8").lower()
    for token in (
        "create table if not exists public.admin_user_actions",
        "alter table public.admin_user_actions enable row level security",
        "alter table public.admin_user_actions force row level security",
        "create or replace function public.admin_list_users",
        "create or replace function public.admin_set_user_status",
        "security definer",
        "set search_path = ''",
        "private.is_active_admin()",
        "p_new_status not in ('active', 'suspended')",
        "pending' and p_new_status = 'active'",
        "active' and p_new_status = 'suspended'",
        "suspended' and p_new_status = 'active'",
        "current_admin_id = p_target_user_id",
        "revoke execute on function public.admin_list_users(text) from public, anon",
        "revoke execute on function public.admin_set_user_status(uuid, text) from public, anon",
        "grant execute on function public.admin_list_users(text) to authenticated",
        "grant execute on function public.admin_set_user_status(uuid, text) to authenticated",
    ):
        assert token in sql, token
    assert "grant update (role" not in sql
    assert "grant update (status" not in sql
    assert "service_role" not in sql


def main() -> None:
    test_list_pending_first_and_search()
    test_allowed_status_transitions()
    test_client_side_admin_and_self_protection()
    test_user_admin_ui_boundary()
    test_migration_security_contract()
    print("V0.4.3.5 ADMIN USER MANAGEMENT TESTS OK")


if __name__ == "__main__":
    main()
