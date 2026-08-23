from __future__ import annotations

import base64
import json
import pathlib
import socket
import sys
import tempfile
import threading
import time
from urllib import parse, request


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthConfig,
    AuthConfigurationError,
    AuthSession,
    SessionStore,
    SupabaseAuthService,
)
from ai_article_studio.ui.auth_ui import ADMIN_MENU, AI_NOTICE, USER_MENU  # noqa: E402


class FakeProtector:
    def protect(self, data: bytes) -> bytes:
        return b"protected:" + data[::-1]

    def unprotect(self, data: bytes) -> bytes:
        assert data.startswith(b"protected:")
        return data[len(b"protected:") :][::-1]


class FakeHttp:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def request_json(self, method, url, *, headers=None, body=None, timeout=20.0):
        self.calls.append({"method": method, "url": url, "headers": dict(headers or {}), "body": body, "timeout": timeout})
        if not self.responses:
            raise AssertionError(f"unexpected request: {method} {url}")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def session_payload(email: str = "user@example.com") -> dict:
    return {
        "access_token": "access-token",
        "refresh_token": "refresh-token",
        "expires_at": time.time() + 3600,
        "user": {"id": "11111111-1111-1111-1111-111111111111", "email": email},
    }


def profile_payload(role: str = "user") -> list[dict]:
    return [{
        "id": "11111111-1111-1111-1111-111111111111",
        "aas_user_id": "AAS-00000001",
        "display_name": "テストユーザー",
        "role": role,
        "status": "active",
        "created_at": "2026-08-23T00:00:00Z",
    }]


def test_config_security() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        config = root / "config"
        config.mkdir()
        (config / "auth.json").write_text(json.dumps({"service_role": "must-not-load"}), encoding="utf-8")
        try:
            AuthConfig.load(root, {})
        except AuthConfigurationError as exc:
            assert exc.code == "service_role_rejected"
        else:
            raise AssertionError("service_role config must be rejected")
    loaded = AuthConfig.load(
        "/does/not/matter",
        {
            "AAS_SUPABASE_URL": "https://project.supabase.co/",
            "AAS_SUPABASE_ANON_KEY": "publishable-key",
            "AAS_AUTH_REQUIRED": "true",
        },
    )
    assert loaded.enabled and loaded.required
    assert loaded.supabase_url == "https://project.supabase.co"
    optional = AuthConfig.load(
        root,
        {
            "AAS_SUPABASE_URL": "https://project.supabase.co",
            "AAS_SUPABASE_ANON_KEY": "publishable-key",
            "AAS_AUTH_REQUIRED": "false",
        },
    )
    assert optional.enabled and not optional.required


def test_password_login_and_session_persistence() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = SessionStore(pathlib.Path(tmp) / "session.bin", FakeProtector())
        http = FakeHttp(session_payload(), profile_payload())
        service = SupabaseAuthService(AuthConfig("https://project.supabase.co", "anon"), store, http)
        user = service.sign_in_with_password("user@example.com", "never-store-this-password")
        assert user.profile.role == "user"
        assert store.load() == user.session
        encoded = store.path.read_bytes()
        protected = base64.b64decode(encoded)
        assert b"never-store-this-password" not in protected
        assert http.calls[0]["body"]["password"] == "never-store-this-password"
        assert "Authorization" not in http.calls[0]["headers"]
        assert http.calls[1]["headers"]["Authorization"] == "Bearer access-token"


def test_signup_consents_and_confirmation() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = SessionStore(pathlib.Path(tmp) / "session.bin", FakeProtector())
        http = FakeHttp({"user": {"id": "pending"}})
        service = SupabaseAuthService(AuthConfig("https://project.supabase.co", "anon"), store, http)
        result = service.sign_up("new@example.com", "password-123", "表示名")
        assert result.confirmation_required and result.authenticated is None
        metadata = http.calls[0]["body"]["data"]
        assert metadata == {
            "display_name": "表示名",
            "terms_accepted": True,
            "privacy_accepted": True,
            "ai_terms_accepted": True,
        }
        assert not store.path.exists()


def test_restore_verifies_profile_on_server() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = SessionStore(pathlib.Path(tmp) / "session.bin", FakeProtector())
        stored = AuthSession.from_payload(session_payload())
        assert store.save(stored)
        http = FakeHttp(profile_payload(role="admin"))
        service = SupabaseAuthService(AuthConfig("https://project.supabase.co", "anon"), store, http)
        restored = service.restore()
        assert restored is not None and restored.profile.role == "admin"
        assert "/rest/v1/profiles?" in http.calls[0]["url"]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_google_pkce_flow() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        port = _free_port()
        redirect = f"http://127.0.0.1:{port}/auth/callback"
        store = SessionStore(pathlib.Path(tmp) / "session.bin", FakeProtector())
        http = FakeHttp(session_payload(), {}, profile_payload())
        service = SupabaseAuthService(AuthConfig("https://project.supabase.co", "anon", redirect_url=redirect), store, http)
        opened = {}

        def open_browser(url: str) -> bool:
            opened["url"] = url

            def callback() -> None:
                with request.urlopen(f"{redirect}?code=test-auth-code", timeout=5) as response:
                    assert response.status == 200

            threading.Thread(target=callback, daemon=True).start()
            return True

        user = service.sign_in_with_google(open_browser, timeout=5)
        assert user.profile.role == "user"
        auth_query = parse.parse_qs(parse.urlparse(opened["url"]).query)
        assert auth_query["provider"] == ["google"]
        assert "state" not in auth_query
        assert auth_query["code_challenge_method"] == ["s256"]
        assert auth_query["redirect_to"] == [redirect]
        assert "code_verifier" in http.calls[0]["body"]
        assert http.calls[1]["url"].endswith("/rest/v1/rpc/accept_current_terms")


def test_ui_and_migration_contract() -> None:
    assert "ChatGPT・API・ローカルAI" in AI_NOTICE
    assert [label for _icon, label, _route in USER_MENU] == [
        "ホーム", "記事作成", "SNS告知", "ブランド管理", "記事ライブラリ", "設定", "サポート"
    ]
    assert [label for _icon, label, _route in ADMIN_MENU] == [
        "ダッシュボード", "ユーザー管理", "記事管理", "ブランド管理", "SNS告知管理", "Feature Flags",
        "ライセンス", "問い合わせ", "要望/不具合", "アップデート", "診断", "ログ", "バックアップ", "設定",
    ]
    ui_text = (ROOT / "src" / "ai_article_studio" / "ui" / "auth_ui.py").read_text(encoding="utf-8")
    core_text = (ROOT / "src" / "ai_article_studio" / "core" / "auth_service.py").read_text(encoding="utf-8")
    sql = (ROOT / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql").read_text(encoding="utf-8")
    assert "Microsoft" not in ui_text + core_text
    assert "alter table public.profiles enable row level security" in sql
    assert "grant update (display_name)" in sql
    assert "grant update (role" not in sql
    assert "private.is_active_admin" in sql
    assert "role in ('user', 'admin')" in sql
    assert "from auth.users as users" in sql


def main() -> None:
    test_config_security()
    test_password_login_and_session_persistence()
    test_signup_consents_and_confirmation()
    test_restore_verifies_profile_on_server()
    test_google_pkce_flow()
    test_ui_and_migration_contract()
    print("V0.4.3.3 AUTH/UI FOUNDATION TESTS OK")


if __name__ == "__main__":
    main()
