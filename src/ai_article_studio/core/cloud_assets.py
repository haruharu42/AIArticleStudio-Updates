from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import socket
from typing import Any, Callable, Mapping
from urllib import error, parse, request
from uuid import UUID

from .auth_service import AuthConfig, AuthenticatedUser, SupabaseAuthService
from .cloud_articles import CloudArticleError, WINDOWS_PRODUCT_CODE
from .image_assets import ArticleImageStore


ARTICLE_ASSET_BUCKET = "article-assets"


@dataclass(frozen=True)
class CloudAssetSyncResult:
    local_article_id: str
    cloud_article_id: str
    uploaded: int = 0
    deleted: int = 0
    refreshed: int = 0
    pending: int = 0


class CloudArticleAssetService:
    """Authenticated Phase 4 article-assets and private Storage client."""

    def __init__(self, config: AuthConfig, *, timeout: float = 30.0):
        if not config.enabled:
            raise CloudArticleError(
                "Supabase接続が設定されていません。",
                category="configuration",
                code="cloud_not_configured",
            )
        self.config = config
        self.timeout = float(timeout)

    def can_access_windows(self, actor: AuthenticatedUser) -> bool:
        return bool(self._rpc(actor, "can_access_product", {"p_product_code": WINDOWS_PRODUCT_CODE}))

    def list_assets(self, actor: AuthenticatedUser, cloud_article_id: str) -> list[dict[str, Any]]:
        self._require_entitlement(actor)
        article_id = self._uuid(cloud_article_id, "cloud_article_id")
        query = parse.urlencode({
            "article_id": f"eq.{article_id}",
            "user_id": f"eq.{actor.profile.id}",
            "select": "*",
            "order": "sort_order.asc,created_at.asc,id.asc",
            "limit": "1001",
        })
        value = self._request(actor, "GET", f"{self.config.supabase_url}/rest/v1/article_assets?{query}")
        if not isinstance(value, list) or len(value) >= 1000:
            # Supabase may cap a response at 1000 rows. Never merge a possibly
            # truncated list as authoritative remote deletions.
            raise self._invalid_response("article_assets incomplete list")
        rows = [self._mapping(item, "article_assets list") for item in value]
        for row in rows:
            asset_id = self._uuid(row.get("id"), "cloud_asset_id")
            extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(str(row.get("mime_type") or ""))
            expected_path = f"{actor.profile.id}/{article_id}/{asset_id}.{extension}"
            if row.get("user_id") != actor.profile.id or row.get("article_id") != article_id or not extension or row.get("storage_bucket") != ARTICLE_ASSET_BUCKET or row.get("storage_path") != expected_path:
                raise self._invalid_response("article_assets ownership/path")
        return rows

    def update_metadata(self, actor: AuthenticatedUser, cloud_article_id: str, asset: Mapping[str, Any]) -> dict[str, Any]:
        self._require_entitlement(actor)
        article_id = self._uuid(cloud_article_id, "cloud_article_id")
        asset_id = self._uuid(asset.get("cloud_asset_id"), "cloud_asset_id")
        stamp = str(asset.get("cloud_updated_at") or "")
        if not stamp:
            raise CloudArticleError("画像を再取得してから編集してください。", category="revision_conflict", code="40001")
        value = self._rpc(actor, "update_article_assets_metadata", {
            "p_article_id": article_id,
            "p_changes": [{"id": asset_id, "expected_updated_at": stamp,
                           "sort_order": int(asset.get("sort_order") or 0),
                           "insertion_marker": asset.get("insertion_marker") or None,
                           "alt_text": str(asset.get("alt_text") or "")}],
        })
        if not isinstance(value, list):
            raise self._invalid_response("update_article_assets_metadata")
        result = next((dict(row) for row in value if isinstance(row, Mapping) and row.get("id") == asset_id), None)
        if result is None or result.get("article_id") != article_id or result.get("user_id") != actor.profile.id or result.get("status") != "ready":
            raise self._invalid_response("update_article_assets_metadata")
        return result

    def article_revision(self, actor: AuthenticatedUser, cloud_article_id: str) -> int:
        self._require_entitlement(actor)
        article_id = self._uuid(cloud_article_id, "cloud_article_id")
        query = parse.urlencode({"id": f"eq.{article_id}", "select": "id,user_id,revision", "limit": "1"})
        rows = self._request(actor, "GET", f"{self.config.supabase_url}/rest/v1/articles?{query}")
        if not isinstance(rows, list) or len(rows) != 1:
            raise CloudArticleError("クラウド記事が見つかりません。", category="not_found", code="P0002")
        row = self._mapping(rows[0], "article revision")
        revision = row.get("revision")
        if row.get("id") != article_id or row.get("user_id") != actor.profile.id or isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            raise self._invalid_response("article revision ownership")
        return revision

    def begin_delete_versioned(self, actor: AuthenticatedUser, asset: Mapping[str, Any], *, expected_revision: int | None = None) -> dict[str, Any]:
        self._require_entitlement(actor)
        article_id = self._uuid(asset.get("article_id"), "cloud_article_id")
        asset_id = self._uuid(asset.get("id"), "cloud_asset_id")
        value = self._rpc(actor, "transition_article_asset_checked", {
            "p_article_id": article_id, "p_asset_id": asset_id,
            "p_expected_updated_at": asset.get("updated_at"),
            "p_expected_article_revision": self.article_revision(actor, article_id) if expected_revision is None else expected_revision,
            "p_action": "begin_delete",
        })
        result = self._mapping(value, "checked image delete")
        row = self._mapping(result.get("asset"), "checked image delete")
        if row.get("id") != asset_id or row.get("article_id") != article_id or row.get("user_id") != actor.profile.id or row.get("status") != "delete_pending" or row.get("storage_path") != asset.get("storage_path"):
            raise self._invalid_response("checked image delete")
        return row

    def prepare(self, actor: AuthenticatedUser, cloud_article_id: str, asset: Mapping[str, Any]) -> dict[str, Any]:
        self._require_entitlement(actor)
        value = self._rpc(actor, "prepare_article_asset", {
            "p_article_id": self._uuid(cloud_article_id, "cloud_article_id"),
            "p_asset_type": str(asset.get("asset_type") or ""),
            "p_original_filename": str(asset.get("original_filename") or "")[:255],
            "p_mime_type": str(asset.get("mime_type") or ""),
            "p_size_bytes": int(asset.get("size_bytes") or 0),
            "p_sort_order": int(asset.get("sort_order") or 0),
            "p_insertion_marker": asset.get("insertion_marker") or None,
            "p_alt_text": str(asset.get("alt_text") or "")[:2000] or None,
        })
        if isinstance(value, list):
            value = value[0] if value else None
        prepared = self._mapping(value, "prepare_article_asset")
        prepared["asset_id"] = self._uuid(prepared.get("asset_id"), "cloud_asset_id")
        prepared["storage_bucket"] = self._bucket(prepared.get("storage_bucket"))
        prepared["storage_path"] = self._storage_path(prepared.get("storage_path"))
        if str(prepared.get("status") or "") != "pending_upload":
            raise self._invalid_response("prepare_article_asset")
        return prepared

    def upload(self, actor: AuthenticatedUser, bucket: str, storage_path: str, file_path: Path, mime_type: str) -> None:
        self._require_entitlement(actor)
        bucket_value = self._bucket(bucket)
        path_value = self._storage_path(storage_path)
        data = Path(file_path).read_bytes()
        self._request(
            actor,
            "POST",
            f"{self.config.supabase_url}/storage/v1/object/{parse.quote(bucket_value, safe='')}/{parse.quote(path_value, safe='/')}",
            raw_body=data,
            content_type=str(mime_type),
            extra_headers={"x-upsert": "false"},
        )

    def finalize(self, actor: AuthenticatedUser, cloud_asset_id: str, checksum_sha256: str) -> dict[str, Any]:
        self._require_entitlement(actor)
        asset_id = self._uuid(cloud_asset_id, "cloud_asset_id")
        value = self._rpc(actor, "finalize_article_asset", {
            "p_asset_id": asset_id,
            "p_width": None,
            "p_height": None,
            "p_checksum_sha256": str(checksum_sha256 or "").lower() or None,
        })
        if isinstance(value, list):
            value = value[0] if len(value) == 1 else None
        finalized = self._mapping(value, "finalize_article_asset")
        if self._uuid(finalized.get("id"), "cloud_asset_id") != asset_id or str(finalized.get("status") or "") != "ready":
            raise self._invalid_response("finalize_article_asset")
        finalized["storage_bucket"] = self._bucket(finalized.get("storage_bucket"))
        finalized["storage_path"] = self._storage_path(finalized.get("storage_path"))
        return finalized

    def begin_delete(self, actor: AuthenticatedUser, cloud_asset_id: str) -> dict[str, Any]:
        self._require_entitlement(actor)
        asset_id = self._uuid(cloud_asset_id, "cloud_asset_id")
        value = self._rpc(actor, "begin_delete_article_asset", {"p_asset_id": asset_id})
        if isinstance(value, list):
            value = value[0] if len(value) == 1 else None
        changed = self._mapping(value, "begin_delete_article_asset")
        if self._uuid(changed.get("id"), "cloud_asset_id") != asset_id or str(changed.get("status") or "") != "delete_pending":
            raise self._invalid_response("begin_delete_article_asset")
        changed["storage_bucket"] = self._bucket(changed.get("storage_bucket"))
        changed["storage_path"] = self._storage_path(changed.get("storage_path"))
        return changed

    def delete_object(self, actor: AuthenticatedUser, bucket: str, storage_path: str) -> None:
        self._require_entitlement(actor)
        self._request(
            actor,
            "DELETE",
            f"{self.config.supabase_url}/storage/v1/object/{parse.quote(self._bucket(bucket), safe='')}",
            json_body={"prefixes": [self._storage_path(storage_path)]},
        )

    def finalize_delete(self, actor: AuthenticatedUser, cloud_asset_id: str) -> str:
        self._require_entitlement(actor)
        return str(self._rpc(actor, "finalize_delete_article_asset", {"p_asset_id": self._uuid(cloud_asset_id, "cloud_asset_id")}) or "")

    def cancel_pending(self, actor: AuthenticatedUser, cloud_asset_id: str) -> str:
        self._require_entitlement(actor)
        return str(self._rpc(actor, "cancel_pending_article_asset", {"p_asset_id": self._uuid(cloud_asset_id, "cloud_asset_id")}) or "")

    def download(self, actor: AuthenticatedUser, bucket: str, storage_path: str) -> bytes:
        self._require_entitlement(actor)
        value = self._request(
            actor,
            "GET",
            f"{self.config.supabase_url}/storage/v1/object/authenticated/{parse.quote(self._bucket(bucket), safe='')}/{parse.quote(self._storage_path(storage_path), safe='/')}",
            expect_json=False,
        )
        return bytes(value)

    def create_signed_url(self, actor: AuthenticatedUser, bucket: str, storage_path: str, *, expires_in: int = 60) -> str:
        self._require_entitlement(actor)
        seconds = int(expires_in)
        if seconds < 1 or seconds > 3600:
            raise ValueError("expires_in must be between 1 and 3600")
        value = self._request(
            actor,
            "POST",
            f"{self.config.supabase_url}/storage/v1/object/sign/{parse.quote(self._bucket(bucket), safe='')}/{parse.quote(self._storage_path(storage_path), safe='/')}",
            json_body={"expiresIn": seconds},
        )
        payload = self._mapping(value, "storage signed URL")
        signed = str(payload.get("signedUrl") or payload.get("signedURL") or "").strip()
        if not signed:
            raise self._invalid_response("storage signed URL")
        return self._absolute_storage_url(signed)

    def _absolute_storage_url(self, signed: str) -> str:
        base = self.config.supabase_url.rstrip("/")
        value = str(signed or "").strip()
        parsed = parse.urlsplit(value)
        if parsed.scheme and parsed.netloc:
            absolute = value
        elif value.startswith("/storage/v1/"):
            absolute = f"{base}{value}"
        elif value.startswith("/object/"):
            absolute = f"{base}/storage/v1{value}"
        else:
            absolute = f"{base}/storage/v1/{value.lstrip('/')}"
        expected = parse.urlsplit(base)
        actual = parse.urlsplit(absolute)
        if actual.scheme != expected.scheme or actual.netloc != expected.netloc:
            raise self._invalid_response("storage signed URL")
        return absolute

    def _require_entitlement(self, actor: AuthenticatedUser) -> None:
        if not self.can_access_windows(actor):
            raise CloudArticleError(
                "Windows版のクラウド画像利用権がありません。",
                category="entitlement_denied",
                code="entitlement_denied",
                status=403,
            )

    def _rpc(self, actor: AuthenticatedUser, function_name: str, body: Mapping[str, Any]) -> Any:
        return self._request(actor, "POST", f"{self.config.supabase_url}/rest/v1/rpc/{function_name}", json_body=body)

    def _request(
        self,
        actor: AuthenticatedUser,
        method: str,
        url: str,
        *,
        json_body: Mapping[str, Any] | None = None,
        raw_body: bytes | None = None,
        content_type: str | None = None,
        extra_headers: Mapping[str, str] | None = None,
        expect_json: bool = True,
    ) -> Any:
        if json_body is not None and raw_body is not None:
            raise ValueError("only one request body is allowed")
        data = json.dumps(dict(json_body)).encode("utf-8") if json_body is not None else raw_body
        headers = {
            "apikey": self.config.anon_key,
            "Authorization": f"Bearer {actor.session.access_token}",
            "Accept": "application/json" if expect_json else "*/*",
        }
        if data is not None:
            headers["Content-Type"] = content_type or "application/json"
        if extra_headers:
            headers.update({str(k): str(v) for k, v in extra_headers.items()})
        http_request = request.Request(url, data=data, headers=headers, method=method)
        try:
            with request.urlopen(http_request, timeout=self.timeout) as response:
                raw_response = response.read()
        except error.HTTPError as exc:
            payload = self._error_payload(exc.read())
            code = str(payload.get("code") or payload.get("error") or "http_error")
            message = str(payload.get("message") or payload.get("error_description") or f"Cloud API HTTP {exc.code}")
            raise CloudArticleError(
                message,
                category=self._error_category(code, message, exc.code),
                code=code,
                status=exc.code,
                details=str(payload.get("details") or ""),
            ) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise CloudArticleError("クラウド画像処理がタイムアウトしました。", category="timeout", code="timeout") from exc
        except error.URLError as exc:
            raise CloudArticleError("クラウドへ接続できません。", category="network_unavailable", code="network_unavailable") from exc
        if not expect_json:
            return raw_response
        if not raw_response:
            return None
        try:
            return json.loads(raw_response.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise self._invalid_response("cloud asset API") from exc

    @staticmethod
    def _error_payload(raw: bytes) -> dict[str, Any]:
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return {}
        return dict(value) if isinstance(value, Mapping) else {}

    @staticmethod
    def _error_category(code: str, message: str, status: int) -> str:
        normalized = f"{code} {message}".lower()
        if status == 401:
            return "unauthorized"
        if status == 403 or code == "42501":
            return "forbidden"
        if status == 404 or code == "P0002":
            return "not_found"
        if code == "40001":
            return "revision_conflict"
        if status in {408, 504}:
            return "timeout"
        if "storage" in normalized or "bucket" in normalized or "object" in normalized or status == 409:
            return "storage_error"
        if status in {400, 422} or code == "22023":
            return "validation_error"
        return "server_error"

    @staticmethod
    def _mapping(value: Any, label: str) -> dict[str, Any]:
        if not isinstance(value, Mapping):
            raise CloudArticleAssetService._invalid_response(label)
        return dict(value)

    @staticmethod
    def _invalid_response(label: str) -> CloudArticleError:
        return CloudArticleError(f"{label}の応答形式が不正です。", category="server_error", code="invalid_response")

    @staticmethod
    def _uuid(value: Any, label: str) -> str:
        try:
            return str(UUID(str(value or "").strip()))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError(f"{label} must be a UUID") from exc

    @staticmethod
    def _bucket(value: Any) -> str:
        if str(value or "") != ARTICLE_ASSET_BUCKET:
            raise ValueError("unsupported storage bucket")
        return ARTICLE_ASSET_BUCKET

    @staticmethod
    def _storage_path(value: Any) -> str:
        path = str(value or "").strip().strip("/")
        if not path or len(path) > 300 or any(part in {"", ".", ".."} for part in path.split("/")):
            raise ValueError("invalid storage path")
        return path


class CloudAssetSyncCoordinator:
    """One-shot image reconciliation; callers decide when to retry."""

    def __init__(
        self,
        image_store: ArticleImageStore,
        cloud: CloudArticleAssetService,
        actor: AuthenticatedUser,
        *,
        auth_service: SupabaseAuthService | None = None,
        actor_updated: Callable[[AuthenticatedUser], None] | None = None,
    ):
        self.image_store = image_store
        self.cloud = cloud
        self.actor = actor
        self.auth_service = auth_service
        self.actor_updated = actor_updated

    def sync_local(self, local_article_id: str, cloud_article_id: str) -> CloudAssetSyncResult:
        local_id = str(local_article_id or "").strip()
        cloud_id = str(UUID(str(cloud_article_id or "").strip()))
        actor = self._current_actor()
        uploaded = deleted = refreshed = 0
        remote_before = self.cloud.list_assets(actor, cloud_id)
        remote_by_id = {str(item.get("id") or ""): item for item in remote_before}

        # Replacement must be delete-old -> create-new because the Phase 4
        # unique indexes include every lifecycle state.
        for asset in self.image_store.list_managed_assets(local_id, include_deleted=True):
            if asset.get("desired_state") == "delete":
                self._delete_one(actor, local_id, asset, remote_by_id)
                deleted += 1

        for asset in self.image_store.list_managed_assets(local_id, include_deleted=True):
            if (asset.get("metadata_dirty") and asset.get("desired_state") == "active"
                    and asset.get("cloud_status") == "ready"):
                self._push_metadata(actor, local_id, cloud_id, asset)

        for asset in self.image_store.list_managed_assets(local_id, include_deleted=True):
            if asset.get("desired_state") != "active" or asset.get("cloud_status") == "ready":
                continue
            if self._upload_one(actor, local_id, cloud_id, asset):
                uploaded += 1

        remote = self.cloud.list_assets(actor, cloud_id)
        refreshed = self._merge_remote(local_id, remote)
        pending = sum(
            1 for item in self.image_store.list_managed_assets(local_id, include_deleted=True)
            if item.get("cloud_status") != "ready" or item.get("desired_state") == "delete" or item.get("metadata_dirty")
        )
        return CloudAssetSyncResult(local_id, cloud_id, uploaded, deleted, refreshed, pending)

    def refresh_remote(self, local_article_id: str, cloud_article_id: str) -> CloudAssetSyncResult:
        actor = self._current_actor()
        remote = self.cloud.list_assets(actor, str(UUID(str(cloud_article_id))))
        refreshed = self._merge_remote(local_article_id, remote)
        return CloudAssetSyncResult(str(local_article_id), str(cloud_article_id), refreshed=refreshed)

    def assert_article_revision(self, cloud_article_id: str, expected_revision: int) -> None:
        if self.cloud.article_revision(self._current_actor(), cloud_article_id) != expected_revision:
            raise CloudArticleError("別の端末で記事が更新されています。記事を再取得して確認してください。", category="revision_conflict", code="40001", status=409)

    def delete_all_for_article(self, local_article_id: str, cloud_article_id: str, *, expected_revision: int | None = None) -> int:
        actor = self._current_actor()
        deleted = 0
        remote = self.cloud.list_assets(actor, str(UUID(str(cloud_article_id))))
        for item in remote:
            self._delete_remote(actor, item, expected_revision=expected_revision)
            deleted += 1
        for local in self.image_store.list_managed_assets(local_article_id, include_deleted=True):
            local_asset_id = str(local.get("local_asset_id") or "")
            try:
                path = self.image_store.managed_file_path(local_article_id, local)
            except ValueError:
                path = None
            if path is not None and path.is_file():
                self.image_store.update_managed_asset(local_article_id, local_asset_id, {
                    "cloud_asset_id": None,
                    "storage_bucket": None,
                    "storage_path": None,
                    "cloud_status": "local_only",
                    "desired_state": "active",
                    "last_sync_error": None,
                })
            else:
                self.image_store.remove_managed_asset(local_article_id, local_asset_id)
        return deleted

    def signed_url(self, asset: Mapping[str, Any], *, expires_in: int = 60) -> str:
        return self.cloud.create_signed_url(
            self._current_actor(),
            str(asset.get("storage_bucket") or ARTICLE_ASSET_BUCKET),
            str(asset.get("storage_path") or ""),
            expires_in=expires_in,
        )

    def download(self, asset: Mapping[str, Any]) -> bytes:
        return self.cloud.download(
            self._current_actor(),
            str(asset.get("storage_bucket") or ARTICLE_ASSET_BUCKET),
            str(asset.get("storage_path") or ""),
        )

    def _upload_one(self, actor: AuthenticatedUser, local_id: str, cloud_id: str, asset: Mapping[str, Any]) -> bool:
        local_asset_id = str(asset.get("local_asset_id") or "")
        current = next(
            (
                item
                for item in self.image_store.list_managed_assets(local_id, include_deleted=True)
                if str(item.get("local_asset_id") or "") == local_asset_id
            ),
            None,
        )
        if current is None or current.get("desired_state") != "active":
            return False
        path = self.image_store.managed_file_path(local_id, current)
        if not path.is_file():
            self._error(local_id, local_asset_id, "local_file_missing")
            raise FileNotFoundError(path)

        if not current.get("cloud_asset_id"):
            prepared = self.cloud.prepare(actor, cloud_id, current)
            prepared_id = str(prepared.get("asset_id") or "")
            try:
                with self.image_store._lock:
                    sent_version = current.get("metadata_edit_version")
                    newest = next((item for item in self.image_store.list_managed_assets(local_id, include_deleted=True)
                                   if item.get("local_asset_id") == local_asset_id), None)
                    if newest is None:
                        raise KeyError(local_asset_id)
                    current = self.image_store.update_managed_asset(local_id, local_asset_id, {
                        "cloud_asset_id": prepared_id,
                        "storage_bucket": str(prepared.get("storage_bucket") or ARTICLE_ASSET_BUCKET),
                        "storage_path": str(prepared.get("storage_path") or ""),
                        "cloud_status": "pending_upload",
                        "metadata_dirty": newest.get("metadata_edit_version") != sent_version,
                        "last_sync_error": None,
                    })
            except KeyError:
                self.cloud.cancel_pending(actor, prepared_id)
                return False
        try:
            self.cloud.upload(
                actor,
                str(current.get("storage_bucket") or ""),
                str(current.get("storage_path") or ""),
                path,
                str(current.get("mime_type") or ""),
            )
        except CloudArticleError as upload_error:
            # A lost response may leave a valid object. Finalize is the safe,
            # idempotence-preserving check because overwrite is forbidden.
            try:
                finalized = self.cloud.finalize(actor, str(current.get("cloud_asset_id") or ""), str(current.get("checksum_sha256") or ""))
            except CloudArticleError:
                self._error(local_id, local_asset_id, f"{upload_error.category}:{upload_error.code}")
                raise upload_error
            else:
                self._ready(local_id, local_asset_id, finalized)
                return True
        finalized = self.cloud.finalize(actor, str(current.get("cloud_asset_id") or ""), str(current.get("checksum_sha256") or ""))
        self._ready(local_id, local_asset_id, finalized)
        return True

    def _delete_one(
        self,
        actor: AuthenticatedUser,
        local_id: str,
        asset: Mapping[str, Any],
        remote_by_id: Mapping[str, Mapping[str, Any]],
    ) -> None:
        local_asset_id = str(asset.get("local_asset_id") or "")
        cloud_asset_id = str(asset.get("cloud_asset_id") or "")
        if not cloud_asset_id:
            self.image_store.remove_managed_asset(local_id, local_asset_id)
            return
        remote = remote_by_id.get(cloud_asset_id)
        if remote is None:
            self.image_store.remove_managed_asset(local_id, local_asset_id)
            return
        remote_asset = dict(remote)
        if asset.get("cloud_updated_at") and remote.get("status") == "ready":
            remote_asset["updated_at"] = asset["cloud_updated_at"]
        remote_asset["checksum_sha256"] = asset.get("checksum_sha256")
        try:
            self._delete_remote(actor, remote_asset)
        except CloudArticleError as exc:
            self._error(local_id, local_asset_id, f"{exc.category}:{exc.code}")
            raise
        self.image_store.remove_managed_asset(local_id, local_asset_id)

    def _delete_remote(self, actor: AuthenticatedUser, asset: Mapping[str, Any], *, expected_revision: int | None = None) -> None:
        status = str(asset.get("status") or asset.get("cloud_status") or "ready")
        cloud_asset_id = str(asset.get("id") or asset.get("cloud_asset_id") or "")
        bucket = str(asset.get("storage_bucket") or ARTICLE_ASSET_BUCKET)
        storage_path = str(asset.get("storage_path") or "")
        if status == "pending_upload":
            try:
                self.cloud.cancel_pending(actor, cloud_asset_id)
                return
            except CloudArticleError as exc:
                if exc.category != "storage_error":
                    raise
                # Upload completed but the response/finalize step was lost.
                # Promote the verified object, then use the normal delete flow.
                row = self.cloud.finalize(actor, cloud_asset_id, str(asset.get("checksum_sha256") or ""))
                bucket = str(row.get("storage_bucket") or bucket)
                storage_path = str(row.get("storage_path") or storage_path)
                asset = row
                status = "ready"
        if status == "ready" or (status == "delete_pending" and (expected_revision is not None or not asset.get("id"))):
            try:
                if expected_revision is None:
                    row = self.cloud.begin_delete_versioned(actor, asset)
                else:
                    row = self.cloud.begin_delete_versioned(actor, asset, expected_revision=expected_revision)
            except CloudArticleError as exc:
                # A previous attempt may have committed begin_delete before a
                # network/storage failure. Only that exact state error is safe
                # to resume as delete_pending.
                if not (status == "delete_pending" and exc.category == "validation_error" and exc.code == "22023"):
                    raise
            else:
                bucket = str(row.get("storage_bucket") or bucket)
                storage_path = str(row.get("storage_path") or storage_path)
        self.cloud.delete_object(actor, bucket, storage_path)
        self.cloud.finalize_delete(actor, cloud_asset_id)

    def _push_metadata(self, actor: AuthenticatedUser, local_id: str, cloud_id: str, asset: Mapping[str, Any]) -> None:
        local_asset_id = str(asset.get("local_asset_id") or "")
        try:
            result = self.cloud.update_metadata(actor, cloud_id, asset)
        except CloudArticleError as exc:
            self.image_store.update_managed_asset(local_id, local_asset_id, {"last_sync_error": f"{exc.category}:{exc.code}"})
            raise
        # A user may type again while the request is in flight. Advance the
        # server baseline but retain that newer local draft for the next sync.
        with self.image_store._lock:
            current = next((item for item in self.image_store.list_managed_assets(local_id, include_deleted=True)
                            if item.get("local_asset_id") == local_asset_id), None)
            if current is None:
                return
            changes = {"cloud_updated_at": result.get("updated_at"), "last_sync_error": None, "cloud_status": "ready"}
            if current.get("metadata_edit_version") == asset.get("metadata_edit_version"):
                changes.update(self._metadata_fields(result))
                changes.update(metadata_dirty=False, remote_metadata_snapshot=None)
            self.image_store.update_managed_asset(local_id, local_asset_id, changes)

    @staticmethod
    def _metadata_fields(row: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "asset_type": str(row.get("asset_type") or "inline"),
            "original_filename": str(row.get("original_filename") or "cloud-image"),
            "mime_type": str(row.get("mime_type") or ""),
            "size_bytes": int(row.get("size_bytes") or 0),
            "checksum_sha256": row.get("checksum_sha256"),
            "width": row.get("width"), "height": row.get("height"),
            "sort_order": int(row.get("sort_order") or 0),
            "insertion_marker": row.get("insertion_marker"),
            "alt_text": str(row.get("alt_text") or ""),
            "cloud_updated_at": row.get("updated_at"),
        }

    def _merge_remote(self, local_id: str, remote: list[dict[str, Any]]) -> int:
        with self.image_store._lock:
            return self._merge_remote_locked(local_id, remote)

    def _merge_remote_locked(self, local_id: str, remote: list[dict[str, Any]]) -> int:
        local_assets = self.image_store.list_managed_assets(local_id, include_deleted=True)
        by_cloud = {str(item.get("cloud_asset_id") or ""): item for item in local_assets if item.get("cloud_asset_id")}
        remote_ids = {str(row.get("id") or "") for row in remote}
        changed = 0
        for cloud_id, local in list(by_cloud.items()):
            if cloud_id and cloud_id not in remote_ids:
                if local.get("metadata_dirty"):
                    self.image_store.update_managed_asset(local_id, str(local.get("local_asset_id") or ""), {
                        "last_sync_error": "remote_image_missing:metadata_retained"})
                    continue
                self.image_store.remove_managed_asset(local_id, str(local.get("local_asset_id") or ""))
                changed += 1
        for row in remote:
            cloud_id = str(row.get("id") or "")
            existing = by_cloud.get(cloud_id)
            changes = {
                "cloud_asset_id": cloud_id,
                "storage_bucket": str(row.get("storage_bucket") or ARTICLE_ASSET_BUCKET),
                "storage_path": str(row.get("storage_path") or ""),
                "cloud_status": str(row.get("status") or "ready"),
                "last_sync_error": None,
            }
            if existing:
                if existing.get("metadata_dirty"):
                    if existing.get("cloud_updated_at") != row.get("updated_at"):
                        changes["last_sync_error"] = "revision_conflict:metadata_retained"
                        changes["remote_metadata_snapshot"] = self._metadata_fields(row)
                else:
                    changes.update(self._metadata_fields(row))
                self.image_store.update_managed_asset(local_id, str(existing.get("local_asset_id")), changes)
                changed += 1
                continue
            remote_type = str(row.get("asset_type") or "inline")
            remote_marker = str(row.get("insertion_marker") or "")
            has_local_replacement = any(
                item.get("desired_state") == "active"
                and not item.get("cloud_asset_id")
                and str(item.get("asset_type") or "") == remote_type
                and (
                    remote_type == "cover"
                    or str(item.get("insertion_marker") or "") == remote_marker
                )
                for item in local_assets
            )
            payload = self.image_store.load_payload(local_id)
            assets = self.image_store._asset_list(payload)
            assets.append({
                "local_asset_id": f"cloud-{cloud_id}",
                "asset_type": remote_type,
                "original_filename": str(row.get("original_filename") or "cloud-image"),
                "managed_filename": "",
                "mime_type": str(row.get("mime_type") or ""),
                "size_bytes": int(row.get("size_bytes") or 0),
                "checksum_sha256": row.get("checksum_sha256"),
                "sort_order": int(row.get("sort_order") or 0),
                "insertion_marker": row.get("insertion_marker"),
                "alt_text": str(row.get("alt_text") or ""),
                **changes,
                "cloud_updated_at": row.get("updated_at"),
                "desired_state": "delete" if has_local_replacement else "active",
                "created_at": str(row.get("created_at") or ""),
                "updated_at": str(row.get("updated_at") or ""),
            })
            payload["managed_assets"] = assets
            self.image_store.save_payload(local_id, payload)
            changed += 1
        return changed

    def _ready(self, local_id: str, local_asset_id: str, row: Mapping[str, Any]) -> None:
        self.image_store.update_managed_asset(local_id, local_asset_id, {
            "cloud_updated_at": row.get("updated_at"),
            "cloud_status": "ready",
            "storage_bucket": str(row.get("storage_bucket") or ARTICLE_ASSET_BUCKET),
            "storage_path": str(row.get("storage_path") or ""),
            "last_sync_error": None,
        })

    def _error(self, local_id: str, local_asset_id: str, value: str) -> None:
        self.image_store.update_managed_asset(local_id, local_asset_id, {
            "cloud_status": "error",
            "last_sync_error": str(value)[:240],
        })

    def _current_actor(self) -> AuthenticatedUser:
        if self.auth_service is None:
            return self.actor
        refreshed = self.auth_service.ensure_authenticated(self.actor)
        if refreshed is not self.actor:
            self.actor = refreshed
            if self.actor_updated is not None:
                self.actor_updated(refreshed)
        return self.actor
