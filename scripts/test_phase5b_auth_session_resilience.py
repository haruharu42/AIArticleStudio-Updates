from __future__ import annotations

from pathlib import Path
import tempfile
import time

from ai_article_studio.core.auth_service import (
    AuthConfig,
    AuthError,
    AuthSession,
    AuthenticatedUser,
    SupabaseAuthService,
    UserProfile,
)


class MemorySessionStore:
    def __init__(self, session):
        self.session = session
        self.clear_count = 0

    def load(self):
        return self.session

    def save(self, session):
        self.session = session
        return True

    def clear(self):
        self.clear_count += 1
        self.session = None


class RestoreService(SupabaseAuthService):
    def __init__(self, store, refresh_error):
        super().__init__(
            AuthConfig("https://example.supabase.co", "publishable", "http://localhost"),
            store,
        )
        self.refresh_error = refresh_error

    def _refresh(self, _refresh_token):
        raise self.refresh_error


def expired_session() -> AuthSession:
    return AuthSession(
        access_token="hidden-access",
        refresh_token="hidden-refresh",
        expires_at=time.time() - 1,
        user_id="00000000-0000-0000-0000-000000000001",
        email="",
    )


def test_restore_keeps_session_on_network_failure() -> None:
    store = MemorySessionStore(expired_session())
    service = RestoreService(
        store,
        AuthError("offline", code="network_error"),
    )
    try:
        service.restore()
    except AuthError as exc:
        assert exc.code == "network_error"
    else:
        raise AssertionError("network restore failure was hidden")
    assert store.clear_count == 0
    assert store.session is not None


def test_restore_clears_definitive_invalid_session() -> None:
    store = MemorySessionStore(expired_session())
    service = RestoreService(
        store,
        AuthError("invalid", code="refresh_token_not_found", status=400),
    )
    assert service.restore() is None
    assert store.clear_count == 1
    assert store.session is None


def test_valid_actor_is_reused_without_network() -> None:
    session = AuthSession(
        access_token="hidden-access",
        refresh_token="hidden-refresh",
        expires_at=time.time() + 3600,
        user_id="00000000-0000-0000-0000-000000000001",
        email="",
    )
    store = MemorySessionStore(session)
    service = RestoreService(store, AssertionError("refresh must not run"))
    user = AuthenticatedUser(
        session=session,
        profile=UserProfile(
            id=session.user_id,
            aas_user_id="AAS-TEST",
            display_name="test",
            role="user",
            status="active",
            created_at="",
        ),
    )
    assert service.ensure_authenticated(user) is user
    assert store.clear_count == 0


def main() -> None:
    test_restore_keeps_session_on_network_failure()
    test_restore_clears_definitive_invalid_session()
    test_valid_actor_is_reused_without_network()
    print("PHASE5B_AUTH_SESSION_RESILIENCE: PASS")


if __name__ == "__main__":
    main()
