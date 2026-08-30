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
from ai_article_studio.core.cloud_article_serializer import (
    cloud_payload_hash,
    deserialize_article_record,
    serialize_article_record,
)
from ai_article_studio.core.cloud_articles import (
    CloudArticleError,
    CloudArticleService,
)
from ai_article_studio.core.db import ArticleDB


def sample_record(article_id: str, article_type: str) -> dict:
    price = 980 if article_type == "有料" else None
    return {
        "article_id": article_id,
        "created_at": "2026-08-29T00:00:00+00:00",
        "updated_at": "2026-08-29T00:01:00+00:00",
        "status": "完成",
        "title": f"{article_type}テスト記事",
        "theme": "保持されるテーマ",
        "request": {
            "platform": "Tips",
            "article_type": article_type,
            "genre": "AI副業",
            "subgenre": "AIライティング副業",
            "target_age": "30代",
            "target_gender": "指定なし",
            "reader_level": "初心者",
            "price_jpy": price,
            "affiliate_enabled": True,
            "unknown_request": {"keep": True},
        },
        "content": {
            "blocks": [{"markdown": "現在の完成本文"}],
            "web_original": "元記事本文",
            "web_publish": "掲載用本文",
            "source": "web_ai",
            "unknown_content": {"keep": True},
        },
        "theme_result": {"selected": 1},
        "research_brief": {"facts": []},
        "article_plan": {"sections": ["A", "B"]},
        "outline": {"headings": ["H2"]},
        "final_audit_report": {"passed": True},
        "cost_estimate": {"total_jpy": 1},
        "cost_actual": {"total_jpy": 2},
        "generation_checkpoint": {"step": 6},
        "generation_history": [{"stage": "test"}],
        "revision_history": [{"note": "test"}],
        "future_unknown_field": {"must_survive": True},
    }


class FakeCloudService(CloudArticleService):
    def __init__(self, access: bool):
        self.access = access
        self.calls = []

    def can_access_windows(self, actor):
        self.calls.append(("entitlement", actor.profile.role))
        return self.access

    def _rpc(self, actor, function_name, body):
        self.calls.append((function_name, deepcopy(dict(body))))
        if function_name == "create_article_with_workspace":
            return {
                "article": {"id": str(uuid4()), "revision": 1},
                "workspace": {"workspace_version": 1},
            }
        if function_name == "get_my_article_stock_summary":
            return [{"current_articles": 0, "max_articles": 100}]
        raise AssertionError(function_name)


def actor(role: str = "user") -> AuthenticatedUser:
    return AuthenticatedUser(
        session=AuthSession(
            access_token="hidden-test-token",
            refresh_token="hidden-test-refresh",
            expires_at=99999999999.0,
            user_id=str(uuid4()),
            email="",
        ),
        profile=UserProfile(
            id=str(uuid4()),
            aas_user_id="AAS-TEST",
            display_name="test",
            role=role,
            status="active",
            created_at="",
        ),
    )


def test_serializer() -> None:
    image_plan = {
        "enabled": True,
        "target": "both",
        "illustration_count": 3,
        "style": "anime",
        "unknown_image_setting": {"keep": True},
    }
    for article_type in ("無料", "有料"):
        local_id = f"local-{article_type}"
        original = sample_record(local_id, article_type)
        original_copy = deepcopy(original)
        serialized = serialize_article_record(original, image_plan=image_plan)
        assert original == original_copy
        assert serialized["article"]["publication_target"] == "tips"
        assert serialized["article"]["article_type"] == (
            "free" if article_type == "無料" else "paid"
        )
        assert serialized["article"]["price"] == (
            None if article_type == "無料" else 980
        )
        assert serialized["article"]["status"] == "ready"
        assert serialized["article"]["body"] == "現在の完成本文"
        assert serialized["workspace"]["source_body"] == "元記事本文"
        assert serialized["workspace"]["publish_body"] == "掲載用本文"
        assert serialized["workspace"]["request_json"]["unknown_request"] == {
            "keep": True
        }
        assert serialized["workspace"]["image_plan_json"] == image_plan
        assert "data:image/" not in str(serialized).lower()
        assert len(cloud_payload_hash(serialized)) == 64

        cloud_article = {
            "id": str(uuid4()),
            "created_at": "2026-08-29T01:00:00+00:00",
            "updated_at": "2026-08-29T01:01:00+00:00",
            "revision": 1,
            **serialized["article"],
        }
        cloud_workspace = {
            "article_id": cloud_article["id"],
            "workspace_version": 1,
            **serialized["workspace"],
        }
        restored, restored_plan = deserialize_article_record(
            cloud_article,
            cloud_workspace,
            local_article_id=local_id,
        )
        assert restored["article_id"] == local_id
        assert restored["title"] == original["title"]
        assert restored["request"]["platform"] == "Tips"
        assert restored["request"]["article_type"] == article_type
        assert restored["request"]["target_age"] == "30代"
        assert restored["request"]["unknown_request"] == {"keep": True}
        assert restored["content"]["blocks"][0]["markdown"] == "現在の完成本文"
        assert restored["content"]["web_original"] == "元記事本文"
        assert restored["content"]["web_publish"] == "掲載用本文"
        assert restored["content"]["unknown_content"] == {"keep": True}
        assert restored["generation_history"] == [{"stage": "test"}]
        assert restored["future_unknown_field"] == {"must_survive": True}
        assert restored_plan == image_plan


def test_local_sync_metadata() -> None:
    with tempfile.TemporaryDirectory() as temp_name:
        database = ArticleDB(Path(temp_name) / "articles.db")
        first = sample_record("local-first", "無料")
        second = sample_record("local-second", "有料")
        database.save(first)
        database.save(second)

        before_first = database.load("local-first")
        before_second = database.load("local-second")
        rows = database.list_cloud_sync()
        assert [row["local_article_id"] for row in rows] == [
            "local-first",
            "local-second",
        ]
        assert all(row["sync_status"] == "local_only" for row in rows)
        assert all(row["cloud_article_id"] is None for row in rows)

        first_cloud_id = str(uuid4())
        first_mapping = database.set_cloud_mapping(
            "local-first",
            first_cloud_id,
            1,
            last_synced_hash="a" * 64,
        )
        assert first_mapping["cloud_article_id"] == first_cloud_id
        assert first_mapping["cloud_revision"] == 1
        assert first_mapping["sync_status"] == "synced"
        assert first_mapping["last_sync_error"] is None

        conflict = database.update_sync_status(
            "local-first",
            "conflict",
            error="revision conflict",
        )
        assert conflict["sync_status"] == "conflict"
        assert conflict["last_sync_error"] == "revision conflict"

        try:
            database.set_cloud_mapping("local-second", first_cloud_id, 1)
        except ValueError as exc:
            assert "already mapped" in str(exc)
        else:
            raise AssertionError("duplicate cloud mapping was accepted")

        assert database.load("local-first") == before_first
        assert database.load("local-second") == before_second
        assert len(database.list_articles()) == 2


def test_cloud_service_gate_and_errors() -> None:
    denied = FakeCloudService(False)
    try:
        denied.create(actor(), {"article": {}, "workspace": {}})
    except CloudArticleError as exc:
        assert exc.category == "entitlement_denied"
    else:
        raise AssertionError("entitlement denial did not stop cloud create")
    assert denied.calls == [("entitlement", "user")]

    admin_service = FakeCloudService(True)
    created = admin_service.create(actor("admin"), {"article": {}, "workspace": {}})
    assert created["article"]["revision"] == 1
    assert admin_service.calls[0] == ("entitlement", "admin")
    assert admin_service.calls[1][0] == "create_article_with_workspace"
    summary = admin_service.quota_summary(actor("admin"))
    assert summary["current_articles"] == 0

    assert CloudArticleService._error_category("40001", "", 500) == "revision_conflict"
    assert CloudArticleService._error_category(
        "P0001", "article_quota_exceeded", 400
    ) == "quota_exceeded"
    assert CloudArticleService._error_category(
        "42501", "active profile required", 403
    ) == "inactive"
    assert CloudArticleService._error_category("22023", "bad", 400) == "validation_error"


def test_migration_contract() -> None:
    migration = (
        Path(__file__).resolve().parents[1]
        / "supabase"
        / "migrations"
        / "20260829121737_article_workspaces.sql"
    ).read_text(encoding="utf-8")
    fk_index_migration = (
        Path(__file__).resolve().parents[1]
        / "supabase"
        / "migrations"
        / "20260829121902_article_workspaces_fk_index.sql"
    ).read_text(encoding="utf-8")
    revision_api_migration = (
        Path(__file__).resolve().parents[1]
        / "supabase"
        / "migrations"
        / "20260829124637_article_workspaces_revision_conflict_api.sql"
    ).read_text(encoding="utf-8")
    revision_api_json_migration = (
        Path(__file__).resolve().parents[1]
        / "supabase"
        / "migrations"
        / "20260829125014_article_workspaces_revision_conflict_api_json_fix.sql"
    ).read_text(encoding="utf-8")
    required = (
        "create table public.article_workspaces",
        "on delete cascade",
        "enable row level security",
        "force row level security",
        "article_workspaces_select_own_active",
        "public.create_article_with_workspace",
        "public.update_article_with_workspace",
        "public.get_article_workspace",
        "public.create_article(",
        "public.update_article(",
        "security definer",
        "set search_path = ''",
        "from public, anon",
        "to authenticated",
        "workspace_image_binary_forbidden",
    )
    for marker in required:
        assert marker in migration, marker
    assert "service_role" not in migration
    assert "storage.objects" not in migration
    assert "article_workspaces_article_owner_idx" in fk_index_migration
    assert "(article_id, user_id)" in fk_index_migration
    assert "for update" in revision_api_migration.lower()
    assert "raise sqlstate 'PGRST'" in revision_api_migration
    assert "'code', '40001'" in revision_api_migration
    assert "jsonb_build_object('status', 409)" in revision_api_migration
    assert "raise sqlstate 'PGRST'" in revision_api_json_migration
    assert "'code', '40001'" in revision_api_json_migration
    assert "'details', 'The expected revision is stale.'" in revision_api_json_migration
    assert "'hint', 'Reload the article before saving again.'" in revision_api_json_migration
    assert "'status', 409" in revision_api_json_migration
    assert "'headers', jsonb_build_object()" in revision_api_json_migration


def main() -> None:
    test_serializer()
    test_local_sync_metadata()
    test_cloud_service_gate_and_errors()
    test_migration_contract()
    print("PHASE5A_CLOUD_WORKSPACE: PASS")


if __name__ == "__main__":
    main()
