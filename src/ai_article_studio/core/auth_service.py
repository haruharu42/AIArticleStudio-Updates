from __future__ import annotations

import base64
import ctypes
from ctypes import wintypes
from dataclasses import asdict, dataclass
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Mapping
from urllib import error, parse, request


DEFAULT_REDIRECT_URL = "http://127.0.0.1:8765/auth/callback"


class AuthError(RuntimeError):
    def __init__(self, message: str, *, code: str = "auth_error", status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


class AuthConfigurationError(AuthError):
    pass


@dataclass(frozen=True)
class AuthConfig:
    supabase_url: str = ""
    anon_key: str = ""
    redirect_url: str = DEFAULT_REDIRECT_URL
    terms_url: str = ""
    privacy_url: str = ""
    ai_terms_url: str = ""
    required: bool = False

    @property
    def enabled(self) -> bool:
        return bool(self.supabase_url and self.anon_key)

    @classmethod
    def load(
        cls,
        app_root: str | Path | None = None,
        environ: Mapping[str, str] | None = None,
    ) -> "AuthConfig":
        env = dict(os.environ if environ is None else environ)
        root = Path(app_root) if app_root else Path(__file__).resolve().parents[3]
        local: dict[str, Any] = {}
        config_path = root / "config" / "auth.json"
        if config_path.is_file():
            try:
                loaded = json.loads(config_path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise AuthConfigurationError(
                    "認証設定ファイルを読み込めません。",
                    code="invalid_auth_config",
                ) from exc
            if not isinstance(loaded, dict):
                raise AuthConfigurationError("認証設定はJSONオブジェクトで指定してください。")
            forbidden = {str(key).lower() for key in loaded if "service_role" in str(key).lower()}
            if forbidden:
                raise AuthConfigurationError(
                    "service_roleはデスクトップアプリへ設定できません。",
                    code="service_role_rejected",
                )
            local = loaded

        def value(env_name: str, config_name: str, default: str = "") -> str:
            return str(env.get(env_name) or local.get(config_name) or default).strip()

        url = value("AAS_SUPABASE_URL", "supabase_url").rstrip("/")
        anon_key = value("AAS_SUPABASE_ANON_KEY", "anon_key")
        if bool(url) != bool(anon_key):
            raise AuthConfigurationError(
                "Supabase URLとanon keyは両方設定してください。",
                code="incomplete_auth_config",
            )
        if anon_key and "service_role" in anon_key.lower():
            raise AuthConfigurationError(
                "service_roleはデスクトップアプリへ設定できません。",
                code="service_role_rejected",
            )
        if "AAS_AUTH_REQUIRED" in env:
            required_raw = str(env["AAS_AUTH_REQUIRED"]).strip().lower()
        elif "required" in local:
            required_raw = str(local["required"]).strip().lower()
        else:
            required_raw = "1" if url else "0"
        required = required_raw in {"1", "true", "yes", "on"}
        return cls(
            supabase_url=url,
            anon_key=anon_key,
            redirect_url=value("AAS_AUTH_REDIRECT_URL", "redirect_url", DEFAULT_REDIRECT_URL),
            terms_url=value("AAS_TERMS_URL", "terms_url"),
            privacy_url=value("AAS_PRIVACY_URL", "privacy_url"),
            ai_terms_url=value("AAS_AI_TERMS_URL", "ai_terms_url"),
            required=required,
        )


@dataclass(frozen=True)
class AuthSession:
    access_token: str
    refresh_token: str
    expires_at: float
    user_id: str
    email: str = ""

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "AuthSession":
        user = payload.get("user") if isinstance(payload.get("user"), Mapping) else {}
        access_token = str(payload.get("access_token") or "")
        refresh_token = str(payload.get("refresh_token") or "")
        user_id = str(user.get("id") or payload.get("user_id") or "")
        if not access_token or not refresh_token or not user_id:
            raise AuthError("認証セッションが不完全です。", code="invalid_session")
        expires_at = payload.get("expires_at")
        if expires_at is None:
            expires_at = time.time() + float(payload.get("expires_in") or 3600)
        return cls(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=float(expires_at),
            user_id=user_id,
            email=str(user.get("email") or payload.get("email") or ""),
        )


@dataclass(frozen=True)
class UserProfile:
    id: str
    aas_user_id: str
    display_name: str
    role: str
    status: str
    created_at: str

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "UserProfile":
        role = str(payload.get("role") or "user")
        status = str(payload.get("status") or "")
        if role not in {"user", "admin"}:
            raise AuthError("プロフィールの権限値が不正です。", code="invalid_profile_role")
        if status == "pending":
            raise AuthError("登録は完了しています。管理者の承認をお待ちください。", code="profile_pending")
        if status != "active":
            raise AuthError("このアカウントは現在利用できません。", code="inactive_profile")
        return cls(
            id=str(payload.get("id") or ""),
            aas_user_id=str(payload.get("aas_user_id") or ""),
            display_name=str(payload.get("display_name") or ""),
            role=role,
            status=status,
            created_at=str(payload.get("created_at") or ""),
        )

    @classmethod
    def local_user(cls) -> "UserProfile":
        return cls(
            id="local",
            aas_user_id="LOCAL",
            display_name="ローカルユーザー",
            role="user",
            status="active",
            created_at="",
        )


@dataclass(frozen=True)
class ManagedUserProfile:
    id: str
    aas_user_id: str
    display_name: str
    role: str
    status: str
    created_at: str

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "ManagedUserProfile":
        role = str(payload.get("role") or "")
        status = str(payload.get("status") or "")
        if role not in {"user", "admin"}:
            raise AuthError("ユーザー権限値が不正です。", code="invalid_profile_role")
        if status not in {"pending", "active", "suspended", "disabled"}:
            raise AuthError("ユーザー状態値が不正です。", code="invalid_profile_status")
        return cls(
            id=str(payload.get("id") or ""),
            aas_user_id=str(payload.get("aas_user_id") or ""),
            display_name=str(payload.get("display_name") or ""),
            role=role,
            status=status,
            created_at=str(payload.get("created_at") or ""),
        )


@dataclass(frozen=True)
class AuthenticatedUser:
    session: AuthSession
    profile: UserProfile


@dataclass(frozen=True)
class RegistrationResult:
    authenticated: AuthenticatedUser | None
    confirmation_required: bool


class JsonHttpClient:
    def request_json(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        body: Mapping[str, Any] | None = None,
        timeout: float = 20.0,
    ) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = request.Request(url, data=data, headers=dict(headers or {}), method=method)
        try:
            with request.urlopen(req, timeout=timeout) as response:
                raw = response.read()
        except error.HTTPError as exc:
            raw = exc.read()
            message, code = _parse_auth_error(raw, fallback=f"認証サービスからHTTP {exc.code}が返されました。")
            raise AuthError(message, code=code, status=exc.code) from exc
        except (error.URLError, TimeoutError, socket.timeout) as exc:
            raise AuthError(
                "認証サービスへ接続できません。ネットワーク接続を確認してください。",
                code="network_error",
            ) from exc
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise AuthError("認証サービスの応答を解釈できません。", code="invalid_response") from exc


def _parse_auth_error(raw: bytes, fallback: str) -> tuple[str, str]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return fallback, "http_error"
    if not isinstance(payload, Mapping):
        return fallback, "http_error"
    message = str(payload.get("msg") or payload.get("message") or payload.get("error_description") or fallback)
    code = str(payload.get("code") or payload.get("error_code") or payload.get("error") or "auth_error")
    return message, code


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


class WindowsDPAPIProtector:
    """Encrypt refresh/access tokens with the current Windows user account."""

    def __init__(self) -> None:
        if os.name != "nt":
            raise OSError("Windows DPAPI is available only on Windows")
        self.crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.crypt32.CryptProtectData.restype = wintypes.BOOL
        self.crypt32.CryptUnprotectData.restype = wintypes.BOOL
        self.kernel32.LocalFree.argtypes = [wintypes.HLOCAL]
        self.kernel32.LocalFree.restype = wintypes.HLOCAL

    @staticmethod
    def _input_blob(data: bytes) -> tuple[_DataBlob, Any]:
        buffer = ctypes.create_string_buffer(data)
        blob = _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
        return blob, buffer

    def protect(self, data: bytes) -> bytes:
        source, keepalive = self._input_blob(data)
        output = _DataBlob()
        if not self.crypt32.CryptProtectData(ctypes.byref(source), None, None, None, None, 0x01, ctypes.byref(output)):
            raise OSError(ctypes.get_last_error(), "CryptProtectData failed")
        try:
            return ctypes.string_at(output.pbData, output.cbData)
        finally:
            self.kernel32.LocalFree(ctypes.cast(output.pbData, wintypes.HLOCAL))
            del keepalive

    def unprotect(self, data: bytes) -> bytes:
        source, keepalive = self._input_blob(data)
        output = _DataBlob()
        if not self.crypt32.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 0x01, ctypes.byref(output)):
            raise OSError(ctypes.get_last_error(), "CryptUnprotectData failed")
        try:
            return ctypes.string_at(output.pbData, output.cbData)
        finally:
            self.kernel32.LocalFree(ctypes.cast(output.pbData, wintypes.HLOCAL))
            del keepalive


class SessionStore:
    def __init__(self, path: str | Path, protector: Any | None = None):
        self.path = Path(path)
        if protector is not None:
            self.protector = protector
        elif os.name == "nt":
            self.protector = WindowsDPAPIProtector()
        else:
            self.protector = None

    @property
    def persistent(self) -> bool:
        return self.protector is not None

    def save(self, session: AuthSession) -> bool:
        if self.protector is None:
            return False
        serialized = json.dumps(asdict(session), ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        protected = self.protector.protect(serialized)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_bytes(base64.b64encode(protected))
        try:
            temporary.chmod(0o600)
        except OSError:
            pass
        temporary.replace(self.path)
        return True

    def load(self) -> AuthSession | None:
        if self.protector is None or not self.path.is_file():
            return None
        try:
            protected = base64.b64decode(self.path.read_bytes(), validate=True)
            raw = self.protector.unprotect(protected)
            payload = json.loads(raw.decode("utf-8"))
            return AuthSession(**payload)
        except (OSError, ValueError, TypeError, UnicodeDecodeError):
            self.clear()
            return None

    def clear(self) -> None:
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            pass


class SupabaseAuthService:
    PROFILE_COLUMNS = "id,aas_user_id,display_name,role,status,created_at"

    def __init__(
        self,
        config: AuthConfig,
        session_store: SessionStore,
        http: JsonHttpClient | None = None,
    ):
        self.config = config
        self.session_store = session_store
        self.http = http or JsonHttpClient()

    def _require_config(self) -> None:
        if not self.config.enabled:
            raise AuthConfigurationError("Supabase Authがまだ設定されていません。", code="auth_not_configured")

    def _headers(self, access_token: str = "") -> dict[str, str]:
        headers = {"apikey": self.config.anon_key, "Content-Type": "application/json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        return headers

    def _auth_url(self, path: str) -> str:
        return f"{self.config.supabase_url}/auth/v1/{path.lstrip('/')}"

    def sign_in_with_password(self, email: str, password: str) -> AuthenticatedUser:
        self._require_config()
        payload = self.http.request_json(
            "POST",
            self._auth_url("token?grant_type=password"),
            headers=self._headers(),
            body={"email": email.strip(), "password": password},
        )
        return self._complete_session(AuthSession.from_payload(payload))

    def sign_up(self, email: str, password: str, display_name: str = "") -> RegistrationResult:
        self._require_config()
        payload = self.http.request_json(
            "POST",
            self._auth_url("signup"),
            headers=self._headers(),
            body={
                "email": email.strip(),
                "password": password,
                "data": {
                    "display_name": display_name.strip(),
                    "terms_accepted": True,
                    "privacy_accepted": True,
                    "ai_terms_accepted": True,
                },
            },
        )
        if not isinstance(payload, Mapping) or not payload.get("access_token"):
            return RegistrationResult(authenticated=None, confirmation_required=True)
        return RegistrationResult(
            authenticated=self._complete_session(AuthSession.from_payload(payload)),
            confirmation_required=False,
        )

    def request_password_reset(self, email: str) -> None:
        self._require_config()
        self.http.request_json(
            "POST",
            self._auth_url("recover"),
            headers=self._headers(),
            body={"email": email.strip(), "redirect_to": self.config.redirect_url},
        )

    def restore(self) -> AuthenticatedUser | None:
        self._require_config()
        session = self.session_store.load()
        if session is None:
            return None
        try:
            if session.expires_at <= time.time() + 60:
                session = self._refresh(session.refresh_token)
            return self._complete_session(session)
        except AuthError:
            self.session_store.clear()
            return None

    def sign_out(self, session: AuthSession | None = None) -> None:
        try:
            if session is not None and self.config.enabled:
                self.http.request_json(
                    "POST",
                    self._auth_url("logout"),
                    headers=self._headers(session.access_token),
                    body={},
                )
        except AuthError:
            pass
        finally:
            self.session_store.clear()

    def admin_list_users(
        self,
        actor: AuthenticatedUser,
        aas_user_id: str = "",
    ) -> list[ManagedUserProfile]:
        self._require_active_admin(actor)
        payload = self.http.request_json(
            "POST",
            f"{self.config.supabase_url}/rest/v1/rpc/admin_list_users",
            headers=self._headers(actor.session.access_token),
            body={"p_aas_user_id": aas_user_id.strip().upper() or None},
        )
        if not isinstance(payload, list) or not all(isinstance(item, Mapping) for item in payload):
            raise AuthError("ユーザー一覧を確認できません。", code="invalid_admin_users_response")
        return [ManagedUserProfile.from_payload(item) for item in payload]

    def admin_set_user_status(
        self,
        actor: AuthenticatedUser,
        target: ManagedUserProfile,
        new_status: str,
    ) -> ManagedUserProfile:
        self._require_active_admin(actor)
        desired = str(new_status or "").strip().lower()
        if desired not in {"active", "suspended"}:
            raise AuthError("指定されたユーザー状態へ変更できません。", code="invalid_status")
        allowed = {
            ("pending", "active"),
            ("active", "suspended"),
            ("suspended", "active"),
        }
        if (target.status, desired) not in allowed:
            raise AuthError("現在の状態からその操作は実行できません。", code="invalid_status_transition")
        if target.id == actor.session.user_id and desired == "suspended":
            raise AuthError(
                "現在ログイン中の管理者アカウントは停止できません。",
                code="cannot_suspend_self",
            )
        payload = self.http.request_json(
            "POST",
            f"{self.config.supabase_url}/rest/v1/rpc/admin_set_user_status",
            headers=self._headers(actor.session.access_token),
            body={"p_target_user_id": target.id, "p_new_status": desired},
        )
        if isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], Mapping):
            return ManagedUserProfile.from_payload(payload[0])
        if isinstance(payload, Mapping):
            return ManagedUserProfile.from_payload(payload)
        raise AuthError("ユーザー状態の更新結果を確認できません。", code="invalid_admin_user_response")

    def _require_active_admin(self, actor: AuthenticatedUser) -> None:
        self._require_config()
        if actor.profile.role != "admin" or actor.profile.status != "active":
            raise AuthError("有効な管理者アカウントが必要です。", code="admin_required")

    def sign_in_with_google(
        self,
        open_browser: Callable[[str], Any],
        *,
        timeout: float = 180.0,
    ) -> AuthenticatedUser:
        self._require_config()
        redirect = parse.urlparse(self.config.redirect_url)
        if redirect.scheme != "http" or redirect.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise AuthConfigurationError(
                "Googleログインのredirect_urlはローカルHTTPコールバックにしてください。",
                code="invalid_redirect_url",
            )
        if not redirect.port:
            raise AuthConfigurationError("Googleログインのredirect_urlにはポート番号が必要です。")
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
        callback = _OAuthCallbackServer(
            host=redirect.hostname,
            port=redirect.port,
            path=redirect.path or "/",
        )
        query = parse.urlencode(
            {
                "provider": "google",
                "redirect_to": self.config.redirect_url,
                "code_challenge": challenge,
                "code_challenge_method": "s256",
            }
        )
        authorization_url = self._auth_url(f"authorize?{query}")
        callback.start()
        try:
            if open_browser(authorization_url) is False:
                raise AuthError("ブラウザーを開けませんでした。", code="browser_open_failed")
            code = callback.wait(timeout)
        finally:
            callback.close()
        payload = self.http.request_json(
            "POST",
            self._auth_url("token?grant_type=pkce"),
            headers=self._headers(),
            body={"auth_code": code, "code_verifier": verifier},
        )
        session = AuthSession.from_payload(payload)
        self._accept_current_terms(session)
        return self._complete_session(session)

    def _refresh(self, refresh_token: str) -> AuthSession:
        payload = self.http.request_json(
            "POST",
            self._auth_url("token?grant_type=refresh_token"),
            headers=self._headers(),
            body={"refresh_token": refresh_token},
        )
        return AuthSession.from_payload(payload)

    def _complete_session(self, session: AuthSession) -> AuthenticatedUser:
        profile = self._fetch_profile(session)
        self.session_store.save(session)
        return AuthenticatedUser(session=session, profile=profile)

    def _accept_current_terms(self, session: AuthSession) -> None:
        self.http.request_json(
            "POST",
            f"{self.config.supabase_url}/rest/v1/rpc/accept_current_terms",
            headers=self._headers(session.access_token),
            body={},
        )

    def _fetch_profile(self, session: AuthSession) -> UserProfile:
        query = parse.urlencode(
            {"id": f"eq.{session.user_id}", "select": self.PROFILE_COLUMNS, "limit": "1"}
        )
        payload = self.http.request_json(
            "GET",
            f"{self.config.supabase_url}/rest/v1/profiles?{query}",
            headers=self._headers(session.access_token),
        )
        if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], Mapping):
            raise AuthError("ユーザープロフィールを確認できません。", code="profile_not_found")
        profile = UserProfile.from_payload(payload[0])
        if profile.id != session.user_id:
            raise AuthError("プロフィールのユーザーIDが一致しません。", code="profile_mismatch")
        return profile


class _OAuthCallbackServer:
    def __init__(self, host: str, port: int, path: str, expected_state: str | None = None):
        self.result: dict[str, str] = {}
        self.path = path
        self.expected_state = expected_state
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
                parsed = parse.urlparse(self.path)
                if parsed.path != outer.path:
                    self.send_error(404)
                    return
                values = parse.parse_qs(parsed.query)
                state = (values.get("state") or [""])[0]
                if outer.expected_state and state != outer.expected_state:
                    outer.result["error"] = "OAuth stateが一致しません。"
                elif values.get("error"):
                    outer.result["error"] = (values.get("error_description") or values.get("error") or ["OAuthログインに失敗しました。"])[0]
                else:
                    outer.result["code"] = (values.get("code") or [""])[0]
                ok = bool(outer.result.get("code"))
                body = (
                    "<html><body style='font-family:sans-serif;background:#0B1020;color:#F8FAFC;padding:40px'>"
                    f"<h2>{'ログインを確認しました' if ok else 'ログインを完了できませんでした'}</h2>"
                    "<p>AI Article Studioへ戻ってください。この画面は閉じて構いません。</p></body></html>"
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, _format: str, *_args: Any) -> None:
                return

        try:
            self.server = ThreadingHTTPServer((host, port), Handler)
        except OSError as exc:
            raise AuthError(
                f"Googleログイン用ポート{port}を開始できません。",
                code="oauth_callback_unavailable",
            ) from exc
        self.server.timeout = 0.25
        self._closed = False

    def start(self) -> None:
        return

    def wait(self, timeout: float) -> str:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and not self.result:
            self.server.handle_request()
        if not self.result:
            raise AuthError("Googleログインが時間切れになりました。", code="oauth_timeout")
        if self.result.get("error"):
            raise AuthError(self.result["error"], code="oauth_error")
        code = self.result.get("code", "")
        if not code:
            raise AuthError("Googleログインの認証コードを取得できません。", code="oauth_code_missing")
        return code

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            self.server.server_close()


def default_session_store(app_root: str | Path | None = None) -> SessionStore:
    root = Path(app_root) if app_root else Path(__file__).resolve().parents[3]
    return SessionStore(root / "data" / "auth" / "session.bin")


def build_auth_service(app_root: str | Path | None = None) -> SupabaseAuthService:
    config = AuthConfig.load(app_root)
    return SupabaseAuthService(config, default_session_store(app_root))
