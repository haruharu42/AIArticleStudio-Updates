from __future__ import annotations

import json
import socket
from typing import Any, Mapping
from urllib import error, parse, request

from .auth_service import AuthConfig, AuthenticatedUser


WINDOWS_PRODUCT_CODE = "AAS-WIN-BETA"


class CloudArticleError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        category: str,
        code: str = "cloud_article_error",
        status: int | None = None,
        details: str = "",
    ):
        super().__init__(message)
        self.category = category
        self.code = code
        self.status = status
        self.details = details


class CloudArticleService:
    """Authenticated Data API client used by the Windows article sync layer.

    Every cloud operation is entitlement-gated and write requests are never
    retried automatically.  The service deliberately contains no Tk/UI code.
    """

    def __init__(self, config: AuthConfig, *, timeout: float = 20.0):
        if not config.enabled:
            raise CloudArticleError(
                "Supabase接続が設定されていません。",
                category="configuration",
                code="cloud_not_configured",
            )
        self.config = config
        self.timeout = float(timeout)

    def can_access_windows(self, actor: AuthenticatedUser) -> bool:
        result = self._rpc(
            actor,
            "can_access_product",
            {"p_product_code": WINDOWS_PRODUCT_CODE},
        )
        return bool(result)

    def create(
        self,
        actor: AuthenticatedUser,
        serialized: Mapping[str, Any],
    ) -> dict[str, Any]:
        self._require_entitlement(actor)
        result = self._rpc(
            actor,
            "create_article_with_workspace",
            {
                "p_article": dict(serialized.get("article") or {}),
                "p_workspace": dict(serialized.get("workspace") or {}),
            },
        )
        return self._mapping(result, "create_article_with_workspace")

    def read_article(
        self,
        actor: AuthenticatedUser,
        cloud_article_id: str,
    ) -> dict[str, Any]:
        self._require_entitlement(actor)
        query = parse.urlencode(
            {
                "id": f"eq.{cloud_article_id}",
                "select": "*",
                "limit": "1",
            }
        )
        result = self._request(
            actor,
            "GET",
            f"{self.config.supabase_url}/rest/v1/articles?{query}",
        )
        if not isinstance(result, list) or not result:
            raise CloudArticleError(
                "クラウド記事が見つかりません。",
                category="not_found",
                code="article_not_found",
                status=404,
            )
        return self._mapping(result[0], "articles read")

    def list_articles(
        self,
        actor: AuthenticatedUser,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Return the active actor's cloud articles in newest-first order."""

        self._require_entitlement(actor)
        limit_value = int(limit)
        if limit_value < 1 or limit_value > 1000:
            raise ValueError("limit must be between 1 and 1000")
        query = parse.urlencode(
            {
                "select": "*",
                "order": "updated_at.desc,id.asc",
                "limit": str(limit_value),
            }
        )
        result = self._request(
            actor,
            "GET",
            f"{self.config.supabase_url}/rest/v1/articles?{query}",
        )
        if not isinstance(result, list):
            raise CloudArticleError(
                "クラウド記事一覧の応答形式が不正です。",
                category="server_error",
                code="invalid_response",
            )
        return [self._mapping(item, "articles list") for item in result]

    def read_workspace(
        self,
        actor: AuthenticatedUser,
        cloud_article_id: str,
    ) -> dict[str, Any]:
        self._require_entitlement(actor)
        result = self._rpc(
            actor,
            "get_article_workspace",
            {"p_article_id": cloud_article_id},
        )
        if isinstance(result, list):
            if not result:
                raise CloudArticleError(
                    "クラウドWorkspaceが見つかりません。",
                    category="not_found",
                    code="workspace_not_found",
                    status=404,
                )
            result = result[0]
        return self._mapping(result, "get_article_workspace")

    def update(
        self,
        actor: AuthenticatedUser,
        cloud_article_id: str,
        expected_revision: int,
        serialized: Mapping[str, Any],
    ) -> dict[str, Any]:
        self._require_entitlement(actor)
        result = self._rpc(
            actor,
            "update_article_with_workspace",
            {
                "p_article_id": cloud_article_id,
                "p_expected_revision": int(expected_revision),
                "p_patch": dict(serialized.get("article") or {}),
                "p_workspace_patch": dict(serialized.get("workspace") or {}),
            },
        )
        return self._mapping(result, "update_article_with_workspace")

    def delete(
        self,
        actor: AuthenticatedUser,
        cloud_article_id: str,
        expected_revision: int,
    ) -> str:
        self._require_entitlement(actor)
        result = self._rpc(
            actor,
            "delete_article",
            {
                "p_article_id": cloud_article_id,
                "p_expected_revision": int(expected_revision),
            },
        )
        return str(result or "")

    def quota_summary(self, actor: AuthenticatedUser) -> dict[str, Any]:
        self._require_entitlement(actor)
        result = self._rpc(actor, "get_my_article_stock_summary", {})
        if isinstance(result, list):
            result = result[0] if result else {}
        return self._mapping(result, "get_my_article_stock_summary")

    def _require_entitlement(self, actor: AuthenticatedUser) -> None:
        if not self.can_access_windows(actor):
            raise CloudArticleError(
                "Windows版のクラウド記事利用権がありません。",
                category="entitlement_denied",
                code="entitlement_denied",
                status=403,
            )

    def _rpc(
        self,
        actor: AuthenticatedUser,
        function_name: str,
        body: Mapping[str, Any],
    ) -> Any:
        return self._request(
            actor,
            "POST",
            f"{self.config.supabase_url}/rest/v1/rpc/{function_name}",
            body=body,
        )

    def _request(
        self,
        actor: AuthenticatedUser,
        method: str,
        url: str,
        *,
        body: Mapping[str, Any] | None = None,
    ) -> Any:
        raw_body = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "apikey": self.config.anon_key,
            "Authorization": f"Bearer {actor.session.access_token}",
            "Accept": "application/json",
        }
        if raw_body is not None:
            headers["Content-Type"] = "application/json"
        http_request = request.Request(
            url,
            data=raw_body,
            headers=headers,
            method=method,
        )
        try:
            with request.urlopen(http_request, timeout=self.timeout) as response:
                raw_response = response.read()
        except error.HTTPError as exc:
            payload = self._error_payload(exc.read())
            code = str(payload.get("code") or "http_error")
            message = str(payload.get("message") or f"Cloud API HTTP {exc.code}")
            details = str(payload.get("details") or "")
            raise CloudArticleError(
                message,
                category=self._error_category(code, message, exc.code),
                code=code,
                status=exc.code,
                details=details,
            ) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise CloudArticleError(
                "クラウド処理がタイムアウトしました。",
                category="timeout",
                code="timeout",
            ) from exc
        except error.URLError as exc:
            raise CloudArticleError(
                "クラウドへ接続できません。",
                category="network_unavailable",
                code="network_unavailable",
            ) from exc

        if not raw_response:
            return None
        try:
            return json.loads(raw_response.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise CloudArticleError(
                "クラウド応答を解釈できません。",
                category="server_error",
                code="invalid_response",
            ) from exc

    @staticmethod
    def _error_payload(raw: bytes) -> dict[str, Any]:
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return {}
        return dict(payload) if isinstance(payload, Mapping) else {}

    @staticmethod
    def _error_category(code: str, message: str, status: int) -> str:
        normalized_code = str(code or "").upper()
        normalized_message = str(message or "").lower()
        if normalized_code == "40001":
            return "revision_conflict"
        if normalized_code == "P0002" or status == 404:
            return "not_found"
        if normalized_code == "P0001" and "article_quota_exceeded" in normalized_message:
            return "quota_exceeded"
        if normalized_code == "P0001" and "article_has_assets" in normalized_message:
            return "asset_dependency"
        if normalized_code == "42501" and "active profile" in normalized_message:
            return "inactive"
        if normalized_code == "42501" or status == 403:
            return "forbidden"
        if status == 401 or normalized_code.startswith("PGRST30"):
            return "unauthorized"
        if normalized_code == "22023" or status in {400, 409, 422}:
            return "validation_error"
        if normalized_code.startswith("PGRST00") or status in {503, 504}:
            return "server_error"
        if "storage" in normalized_message:
            return "storage_error"
        return "server_error"

    @staticmethod
    def _mapping(value: Any, label: str) -> dict[str, Any]:
        if not isinstance(value, Mapping):
            raise CloudArticleError(
                f"{label}の応答形式が不正です。",
                category="server_error",
                code="invalid_response",
            )
        return dict(value)
