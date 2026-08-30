from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping
from uuid import UUID

from .auth_service import AuthenticatedUser, SupabaseAuthService
from .cloud_article_serializer import (
    cloud_payload_hash,
    deserialize_article_record,
    serialize_article_record,
)
from .cloud_articles import CloudArticleError, CloudArticleService
from .db import ArticleDB


@dataclass(frozen=True)
class CloudSyncResult:
    action: str
    local_article_id: str
    cloud_article_id: str = ""
    cloud_revision: int | None = None
    imported: int = 0
    updated: int = 0
    skipped: int = 0


class CloudArticleSyncCoordinator:
    """Coordinate explicit Windows-local and Supabase article synchronization.

    Supabase is the shared source of truth after a local article has a cloud
    mapping.  Existing local-only articles remain untouched until the user
    explicitly saves or edits them.  Writes are attempted once and are never
    retried automatically.
    """

    RETRYABLE_CATEGORIES = {
        "network_unavailable",
        "timeout",
        "unauthorized",
        "server_error",
    }

    def __init__(
        self,
        database: ArticleDB,
        cloud: CloudArticleService,
        actor: AuthenticatedUser,
        *,
        auth_service: SupabaseAuthService | None = None,
        actor_updated: Callable[[AuthenticatedUser], None] | None = None,
    ):
        self.database = database
        self.cloud = cloud
        self.actor = actor
        self.auth_service = auth_service
        self.actor_updated = actor_updated

    def push_local(self, local_article_id: str) -> CloudSyncResult:
        """Create or update one cloud article from its local cache record."""

        local_id = self._local_id(local_article_id)
        record = self.database.load(local_id)
        if not isinstance(record, Mapping):
            raise KeyError(local_id)
        mapping = self.database.get_cloud_sync(local_id) or {}
        cloud_id = str(mapping.get("cloud_article_id") or "").strip()
        serialized = serialize_article_record(
            record,
            image_plan=self._mapping(record.get("image_plan")),
        )
        pending_status = "pending_update" if cloud_id else "pending_create"
        self.database.update_sync_status(local_id, pending_status)

        try:
            actor = self._current_actor()
            if cloud_id:
                revision = int(mapping.get("cloud_revision") or 0)
                if revision < 1:
                    raise CloudArticleError(
                        "クラウド記事のrevisionが不正です。",
                        category="validation_error",
                        code="invalid_cloud_revision",
                    )
                bundle = self.cloud.update(
                    actor,
                    cloud_id,
                    revision,
                    serialized,
                )
                action = "updated"
            else:
                bundle = self.cloud.create(actor, serialized)
                action = "created"
            article, workspace = self._bundle(bundle)
            cloud_id = self._cloud_id(article.get("id"))
            revision = self._revision(article.get("revision"))
            self.database.set_cloud_mapping(
                local_id,
                cloud_id,
                revision,
                sync_status="synced",
                last_synced_hash=cloud_payload_hash(
                    {"article": article, "workspace": workspace}
                ),
            )
            return CloudSyncResult(
                action=action,
                local_article_id=local_id,
                cloud_article_id=cloud_id,
                cloud_revision=revision,
            )
        except CloudArticleError as exc:
            self._record_push_error(
                local_id,
                exc,
                cloud_mapping_exists=bool(cloud_id),
                pending_status=pending_status,
            )
            raise
        except Exception as exc:
            self.database.update_sync_status(
                local_id,
                "error",
                error=f"local_sync_error:{type(exc).__name__}",
            )
            raise

    def pull_cloud(self, *, limit: int = 100) -> CloudSyncResult:
        """Refresh safe cloud rows into the local cache without overwriting edits."""

        actor = self._current_actor()
        imported = 0
        updated = 0
        skipped = 0
        for article in self.cloud.list_articles(actor, limit=limit):
            cloud_id = self._cloud_id(article.get("id"))
            revision = self._revision(article.get("revision"))
            mapping = self.database.get_cloud_sync_by_cloud_id(cloud_id)

            if mapping:
                local_id = self._local_id(mapping.get("local_article_id"))
                status = str(mapping.get("sync_status") or "local_only")
                known_revision = int(mapping.get("cloud_revision") or 0)
                if status != "synced":
                    if status == "pending_update" and known_revision != revision:
                        self.database.update_sync_status(
                            local_id,
                            "conflict",
                            error="revision_conflict:remote_changed",
                        )
                    skipped += 1
                    continue
                if known_revision == revision:
                    skipped += 1
                    continue
            else:
                local_id = self._available_local_id(cloud_id)

            workspace = self.cloud.read_workspace(actor, cloud_id)
            record, image_plan = deserialize_article_record(
                article,
                workspace,
                local_article_id=local_id,
            )
            record["image_plan"] = image_plan
            self.database.save(record)
            self.database.set_cloud_mapping(
                local_id,
                cloud_id,
                revision,
                sync_status="synced",
                last_synced_hash=cloud_payload_hash(
                    {"article": article, "workspace": workspace}
                ),
            )
            if mapping:
                updated += 1
            else:
                imported += 1

        return CloudSyncResult(
            action="pulled",
            local_article_id="",
            imported=imported,
            updated=updated,
            skipped=skipped,
        )

    def delete_local(self, local_article_id: str) -> bool:
        """Delete cloud first when mapped, then remove the local cache row."""

        local_id = self._local_id(local_article_id)
        if self.database.load(local_id) is None:
            return False
        mapping = self.database.get_cloud_sync(local_id) or {}
        cloud_id = str(mapping.get("cloud_article_id") or "").strip()
        if not cloud_id:
            return self.database.delete(local_id)

        try:
            revision = self._revision(mapping.get("cloud_revision"))
            self.cloud.delete(self._current_actor(), cloud_id, revision)
        except CloudArticleError as exc:
            self.database.update_sync_status(
                local_id,
                "error",
                error=self._safe_error(exc),
            )
            raise
        return self.database.delete(local_id)

    def _current_actor(self) -> AuthenticatedUser:
        if self.auth_service is None:
            return self.actor
        refreshed = self.auth_service.ensure_authenticated(self.actor)
        if refreshed is not self.actor:
            self.actor = refreshed
            if self.actor_updated is not None:
                self.actor_updated(refreshed)
        return self.actor

    def _record_push_error(
        self,
        local_id: str,
        exc: CloudArticleError,
        *,
        cloud_mapping_exists: bool,
        pending_status: str,
    ) -> None:
        if exc.category == "revision_conflict":
            status = "conflict"
        elif exc.category == "entitlement_denied" and not cloud_mapping_exists:
            status = "local_only"
        elif exc.category in self.RETRYABLE_CATEGORIES:
            status = pending_status
        else:
            status = "error"
        self.database.update_sync_status(
            local_id,
            status,
            error=self._safe_error(exc),
        )

    def _available_local_id(self, cloud_article_id: str) -> str:
        cloud_uuid = UUID(self._cloud_id(cloud_article_id))
        base = f"cloud_{cloud_uuid.hex}"
        candidate = base
        suffix = 2
        while self.database.load(candidate) is not None:
            candidate = f"{base}_{suffix}"
            suffix += 1
        return candidate

    @staticmethod
    def _bundle(value: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        if not isinstance(value, Mapping):
            raise CloudArticleError(
                "クラウド記事の応答形式が不正です。",
                category="server_error",
                code="invalid_response",
            )
        article = value.get("article")
        workspace = value.get("workspace")
        if not isinstance(article, Mapping) or not isinstance(workspace, Mapping):
            raise CloudArticleError(
                "クラウド記事の応答形式が不正です。",
                category="server_error",
                code="invalid_response",
            )
        return dict(article), dict(workspace)

    @staticmethod
    def _local_id(value: Any) -> str:
        result = str(value or "").strip()
        if not result:
            raise ValueError("local_article_id is required")
        return result

    @staticmethod
    def _cloud_id(value: Any) -> str:
        try:
            return str(UUID(str(value or "").strip()))
        except (ValueError, AttributeError, TypeError) as exc:
            raise CloudArticleError(
                "クラウド記事IDが不正です。",
                category="server_error",
                code="invalid_cloud_article_id",
            ) from exc

    @staticmethod
    def _revision(value: Any) -> int:
        try:
            revision = int(value)
        except (ValueError, TypeError) as exc:
            raise CloudArticleError(
                "クラウド記事のrevisionが不正です。",
                category="server_error",
                code="invalid_cloud_revision",
            ) from exc
        if revision < 1:
            raise CloudArticleError(
                "クラウド記事のrevisionが不正です。",
                category="server_error",
                code="invalid_cloud_revision",
            )
        return revision

    @staticmethod
    def _mapping(value: Any) -> dict[str, Any]:
        return dict(value) if isinstance(value, Mapping) else {}

    @staticmethod
    def _safe_error(exc: CloudArticleError) -> str:
        return f"{exc.category}:{exc.code}"[:240]
