from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import tempfile
from uuid import uuid4

from ai_article_studio.core.auth_service import (
    AuthSession,
    AuthenticatedUser,
    UserProfile,
)
from ai_article_studio.core.cloud_article_sync import CloudArticleSyncCoordinator
from ai_article_studio.core.cloud_article_serializer import serialize_article_record
from ai_article_studio.core.cloud_articles import CloudArticleError
from ai_article_studio.core.db import ArticleDB
from ai_article_studio.ui.cloud_sync_ui import CloudAwareArticleDB


def actor() -> AuthenticatedUser:
    user_id = str(uuid4())
    return AuthenticatedUser(
        session=AuthSession(
            access_token="hidden-test-token",
            refresh_token="hidden-test-refresh",
            expires_at=99999999999.0,
            user_id=user_id,
            email="",
        ),
        profile=UserProfile(
            id=user_id,
            aas_user_id="AAS-TEST",
            display_name="test",
            role="user",
            status="active",
            created_at="",
        ),
    )


def record(local_id: str, title: str = "同期テスト") -> dict:
    return {
        "article_id": local_id,
        "created_at": "2026-08-30T00:00:00+00:00",
        "updated_at": "2026-08-30T00:00:00+00:00",
        "status": "完成",
        "title": title,
        "theme": title,
        "request": {
            "platform": "note",
            "article_type": "有料",
            "genre": "AI副業",
            "subgenre": "AIライティング副業",
            "price_jpy": 980,
            "target_age": "30代",
            "future_request": {"keep": True},
        },
        "content": {
            "blocks": [{"markdown": "現在の本文"}],
            "web_original": "元記事",
            "web_publish": "掲載用本文",
            "unknown_content": {"keep": True},
        },
        "image_plan": {
            "enabled": True,
            "target": "both",
            "illustration_count": 3,
            "insertion_markers": ["[挿絵01]"],
        },
        "future_record": {"keep": True},
        "cost_actual": {"total_jpy": 0},
    }


class FakeCloud:
    def __init__(self, *, access: bool = True):
        self.access = access
        self.rows: dict[str, dict] = {}
        self.fail_create: CloudArticleError | None = None
        self.fail_delete: CloudArticleError | None = None

    def _gate(self) -> None:
        if not self.access:
            raise CloudArticleError(
                "denied",
                category="entitlement_denied",
                code="entitlement_denied",
                status=403,
            )

    def create(self, _actor, serialized):
        self._gate()
        if self.fail_create:
            raise self.fail_create
        cloud_id = str(uuid4())
        article = {
            "id": cloud_id,
            "revision": 1,
            "created_at": "2026-08-30T00:01:00+00:00",
            "updated_at": "2026-08-30T00:01:00+00:00",
            **deepcopy(serialized["article"]),
        }
        workspace = {
            "article_id": cloud_id,
            "workspace_version": 1,
            "created_at": "2026-08-30T00:01:00+00:00",
            "updated_at": "2026-08-30T00:01:00+00:00",
            **deepcopy(serialized["workspace"]),
        }
        self.rows[cloud_id] = {"article": article, "workspace": workspace}
        return deepcopy(self.rows[cloud_id])

    def update(self, _actor, cloud_id, expected_revision, serialized):
        self._gate()
        bundle = self.rows[cloud_id]
        if int(bundle["article"]["revision"]) != int(expected_revision):
            raise CloudArticleError(
                "conflict",
                category="revision_conflict",
                code="40001",
                status=409,
            )
        revision = int(expected_revision) + 1
        bundle["article"].update(deepcopy(serialized["article"]))
        bundle["article"]["revision"] = revision
        bundle["article"]["updated_at"] = "2026-08-30T00:02:00+00:00"
        bundle["workspace"].update(deepcopy(serialized["workspace"]))
        bundle["workspace"]["workspace_version"] = revision
        return deepcopy(bundle)

    def list_articles(self, _actor, *, limit=100):
        self._gate()
        return [
            deepcopy(bundle["article"])
            for bundle in list(self.rows.values())[:limit]
        ]

    def read_workspace(self, _actor, cloud_id):
        self._gate()
        return deepcopy(self.rows[cloud_id]["workspace"])

    def delete(self, _actor, cloud_id, expected_revision):
        self._gate()
        if self.fail_delete:
            raise self.fail_delete
        if int(self.rows[cloud_id]["article"]["revision"]) != int(expected_revision):
            raise CloudArticleError(
                "conflict",
                category="revision_conflict",
                code="40001",
                status=409,
            )
        del self.rows[cloud_id]
        return cloud_id


class FakeBridge:
    def __init__(self):
        self.saved = []
        self.deleted = []

    def schedule_push(self, payload):
        self.saved.append(payload["article_id"])

    def delete(self, article_id):
        self.deleted.append(article_id)
        return True


def test_create_update_conflict() -> None:
    with tempfile.TemporaryDirectory() as temp_name:
        database = ArticleDB(Path(temp_name) / "articles.db")
        local = record("local-create")
        database.save(local)
        cloud = FakeCloud()
        sync = CloudArticleSyncCoordinator(database, cloud, actor())

        created = sync.push_local("local-create")
        assert created.action == "created"
        mapping = database.get_cloud_sync("local-create")
        assert mapping["sync_status"] == "synced"
        assert mapping["cloud_revision"] == 1
        cloud_id = mapping["cloud_article_id"]

        edited = database.load("local-create")
        edited["title"] = "更新タイトル"
        database.save(edited)
        assert database.get_cloud_sync("local-create")["sync_status"] == "pending_update"
        updated = sync.push_local("local-create")
        assert updated.action == "updated"
        assert updated.cloud_revision == 2
        assert cloud.rows[cloud_id]["article"]["title"] == "更新タイトル"

        cloud.rows[cloud_id]["article"]["revision"] = 3
        edited = database.load("local-create")
        edited["title"] = "競合しても残るローカルタイトル"
        database.save(edited)
        try:
            sync.push_local("local-create")
        except CloudArticleError as exc:
            assert exc.category == "revision_conflict"
        else:
            raise AssertionError("revision conflict was accepted")
        assert database.get_cloud_sync("local-create")["sync_status"] == "conflict"
        assert database.load("local-create")["title"] == "競合しても残るローカルタイトル"


def test_offline_and_entitlement_preserve_local() -> None:
    with tempfile.TemporaryDirectory() as temp_name:
        database = ArticleDB(Path(temp_name) / "articles.db")
        database.save(record("offline"))
        cloud = FakeCloud()
        cloud.fail_create = CloudArticleError(
            "offline",
            category="network_unavailable",
            code="network_unavailable",
        )
        sync = CloudArticleSyncCoordinator(database, cloud, actor())
        try:
            sync.push_local("offline")
        except CloudArticleError:
            pass
        else:
            raise AssertionError("offline create unexpectedly succeeded")
        metadata = database.get_cloud_sync("offline")
        assert metadata["sync_status"] == "pending_create"
        assert metadata["last_sync_error"] == "network_unavailable:network_unavailable"
        assert database.load("offline")["content"]["blocks"][0]["markdown"] == "現在の本文"

        database.save(record("no-entitlement"))
        denied = CloudArticleSyncCoordinator(database, FakeCloud(access=False), actor())
        try:
            denied.push_local("no-entitlement")
        except CloudArticleError as exc:
            assert exc.category == "entitlement_denied"
        else:
            raise AssertionError("entitlement denial unexpectedly succeeded")
        assert database.get_cloud_sync("no-entitlement")["sync_status"] == "local_only"


def test_pull_and_safe_delete() -> None:
    with tempfile.TemporaryDirectory() as temp_name:
        database = ArticleDB(Path(temp_name) / "articles.db")
        cloud = FakeCloud()
        serialized = serialize_article_record(
            record("origin-local"),
            image_plan=record("origin-local")["image_plan"],
        )
        seeded = cloud.create(actor(), serialized)
        cloud_id = seeded["article"]["id"]
        sync = CloudArticleSyncCoordinator(database, cloud, actor())
        pulled = sync.pull_cloud()
        assert pulled.imported == 1
        mapping = database.get_cloud_sync_by_cloud_id(cloud_id)
        assert mapping["sync_status"] == "synced"
        local_id = mapping["local_article_id"]
        restored = database.load(local_id)
        assert restored["title"] == "同期テスト"
        assert restored["request"]["future_request"] == {"keep": True}
        assert restored["future_record"] == {"keep": True}
        assert restored["image_plan"]["illustration_count"] == 3

        cloud.fail_delete = CloudArticleError(
            "assets",
            category="asset_dependency",
            code="P0001",
        )
        try:
            sync.delete_local(local_id)
        except CloudArticleError as exc:
            assert exc.category == "asset_dependency"
        else:
            raise AssertionError("failed cloud delete removed local data")
        assert database.load(local_id) is not None

        cloud.fail_delete = None
        assert sync.delete_local(local_id) is True
        assert database.load(local_id) is None
        assert cloud_id not in cloud.rows


def test_cloud_aware_db_proxy() -> None:
    with tempfile.TemporaryDirectory() as temp_name:
        database = ArticleDB(Path(temp_name) / "articles.db")
        bridge = FakeBridge()
        proxy = CloudAwareArticleDB(database, bridge)
        proxy.save(record("proxy"))
        assert bridge.saved == ["proxy"]
        assert proxy.load("proxy")["title"] == "同期テスト"
        assert proxy.delete("proxy") is True
        assert bridge.deleted == ["proxy"]


def main() -> None:
    test_create_update_conflict()
    test_offline_and_entitlement_preserve_local()
    test_pull_and_safe_delete()
    test_cloud_aware_db_proxy()
    print("PHASE5B_CLOUD_ARTICLE_SYNC: PASS")


if __name__ == "__main__":
    main()
