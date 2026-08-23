from __future__ import annotations

import pathlib
import socket
import sys
import tempfile
import threading
from urllib import parse, request


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthConfig,
    AuthError,
    SessionStore,
    SupabaseAuthService,
)


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
        return self.responses.pop(0)


def _session_payload() -> dict:
    return {
        "access_token": "access-token",
        "refresh_token": "refresh-token",
        "expires_in": 3600,
        "user": {"id": "11111111-1111-1111-1111-111111111111", "email": "user@example.com"},
    }


def _profile_payload() -> list[dict]:
    return [{
        "id": "11111111-1111-1111-1111-111111111111",
        "aas_user_id": "AAS-00000001",
        "display_name": "テストユーザー",
        "role": "user",
        "status": "active",
        "created_at": "2026-08-23T00:00:00Z",
    }]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_google_pkce_without_client_state() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        port = _free_port()
        redirect = f"http://127.0.0.1:{port}/auth/callback"
        http = FakeHttp(_session_payload(), {}, _profile_payload())
        store = SessionStore(pathlib.Path(tmp) / "session.bin", FakeProtector())
        service = SupabaseAuthService(AuthConfig("https://project.supabase.co", "anon", redirect_url=redirect), store, http)
        opened: dict[str, str] = {}

        def open_browser(url: str) -> bool:
            opened["url"] = url

            def callback() -> None:
                with request.urlopen(f"{redirect}?code=test-auth-code", timeout=5) as response:
                    assert response.status == 200

            threading.Thread(target=callback, daemon=True).start()
            return True

        user = service.sign_in_with_google(open_browser, timeout=5)
        assert user.profile.role == "user"
        authorize_query = parse.parse_qs(parse.urlparse(opened["url"]).query)
        assert "state" not in authorize_query
        assert authorize_query["provider"] == ["google"]
        assert authorize_query["redirect_to"] == [redirect]
        assert authorize_query["code_challenge_method"] == ["s256"]
        assert authorize_query["code_challenge"][0]
        token_call = http.calls[0]
        assert token_call["url"].endswith("/auth/v1/token?grant_type=pkce")
        assert token_call["body"]["auth_code"] == "test-auth-code"
        assert token_call["body"]["code_verifier"]
        assert store.load() == user.session


def test_google_callback_error_is_preserved() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        port = _free_port()
        redirect = f"http://127.0.0.1:{port}/auth/callback"
        http = FakeHttp()
        store = SessionStore(pathlib.Path(tmp) / "session.bin", FakeProtector())
        service = SupabaseAuthService(AuthConfig("https://project.supabase.co", "anon", redirect_url=redirect), store, http)

        def open_browser(_url: str) -> bool:
            def callback() -> None:
                request.urlopen(
                    f"{redirect}?error=access_denied&error_description=Google+login+cancelled",
                    timeout=5,
                ).close()

            threading.Thread(target=callback, daemon=True).start()
            return True

        try:
            service.sign_in_with_google(open_browser, timeout=5)
        except AuthError as exc:
            assert exc.code == "oauth_error"
            assert "Google login cancelled" in str(exc)
        else:
            raise AssertionError("OAuth callback errors must raise AuthError")
        assert http.calls == []
        assert not store.path.exists()


def main() -> None:
    test_google_pkce_without_client_state()
    test_google_callback_error_is_preserved()
    print("V0.4.3.4 GOOGLE OAUTH TESTS OK")


if __name__ == "__main__":
    main()
