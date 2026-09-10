from __future__ import annotations

from pathlib import Path
import tempfile
from uuid import uuid4

from ai_article_studio.core.auth_service import AuthConfig, AuthSession, AuthenticatedUser, UserProfile
from ai_article_studio.core.cloud_assets import CloudArticleAssetService, CloudAssetSyncCoordinator
from ai_article_studio.core.cloud_articles import CloudArticleError
from ai_article_studio.core.image_assets import ArticleImageStore


PNG = b"\x89PNG\r\n\x1a\n" + b"phase5c-sync"


def actor() -> AuthenticatedUser:
    user_id = str(uuid4())
    return AuthenticatedUser(
        session=AuthSession("token", "refresh", 99999999999.0, user_id, ""),
        profile=UserProfile(user_id, "AAS-TEST", "test", "user", "active", ""),
    )


class FakeAssetCloud:
    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.objects: dict[str, bytes] = {}
        self.events: list[str] = []
        self.fail_upload = False

    def prepare(self, _actor, cloud_article_id, asset):
        asset_id = str(uuid4())
        extension = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[asset["mime_type"]]
        path = f"user/{cloud_article_id}/{asset_id}{extension}"
        self.rows[asset_id] = {**dict(asset), "id": asset_id, "article_id": cloud_article_id, "status": "pending_upload", "storage_bucket": "article-assets", "storage_path": path}
        self.events.append("prepare")
        return {
            "asset_id": asset_id,
            "storage_bucket": "article-assets",
            "storage_path": path,
            "status": "pending_upload",
        }

    def upload(self, _actor, _bucket, path, file_path, _mime_type):
        self.events.append("upload")
        if self.fail_upload:
            raise CloudArticleError("offline", category="network_unavailable", code="network_unavailable")
        if path in self.objects:
            raise CloudArticleError("exists", category="storage_error", code="KeyAlreadyExists", status=409)
        self.objects[path] = Path(file_path).read_bytes()

    def finalize(self, _actor, asset_id, checksum):
        self.events.append("finalize")
        row = self.rows[asset_id]
        if row["storage_path"] not in self.objects:
            raise CloudArticleError("missing", category="storage_error", code="storage_object_missing")
        row.update(status="ready", checksum_sha256=checksum)
        return dict(row)

    def list_assets(self, _actor, cloud_article_id):
        return [dict(row) for row in self.rows.values() if row["article_id"] == cloud_article_id]

    def begin_delete_versioned(self, _actor, asset):
        return self.begin_delete(_actor, asset["id"])

    def begin_delete(self, _actor, asset_id):
        self.events.append("begin_delete")
        self.rows[asset_id]["status"] = "delete_pending"
        return dict(self.rows[asset_id])

    def delete_object(self, _actor, _bucket, path):
        self.events.append("delete_object")
        self.objects.pop(path, None)

    def finalize_delete(self, _actor, asset_id):
        self.events.append("finalize_delete")
        del self.rows[asset_id]
        return asset_id

    def cancel_pending(self, _actor, asset_id):
        self.events.append("cancel_pending")
        row = self.rows[asset_id]
        if row["storage_path"] in self.objects:
            raise CloudArticleError("exists", category="storage_error", code="storage_object_exists")
        del self.rows[asset_id]
        return asset_id

    def create_signed_url(self, *_args, **_kwargs):
        return "https://example.invalid/temporary"


def add_cover(store: ArticleImageStore, root: Path, article_id: str, suffix: bytes = b"") -> dict:
    path = root / f"source-{len(suffix)}.png"
    path.write_bytes(PNG + suffix)
    return store.add_managed_asset(article_id, path, asset_type="cover")


def test_upload_replace_delete_order() -> None:
    with tempfile.TemporaryDirectory(prefix="aas_phase5c_sync_") as temp_name:
        root = Path(temp_name)
        local_id = "local"
        cloud_id = str(uuid4())
        store = ArticleImageStore(root / "images")
        cloud = FakeAssetCloud()
        sync = CloudAssetSyncCoordinator(store, cloud, actor())
        first = add_cover(store, root, local_id)
        result = sync.sync_local(local_id, cloud_id)
        assert result.uploaded == 1 and result.pending == 0
        ready = store.list_managed_assets(local_id)[0]
        assert ready["local_asset_id"] == first["local_asset_id"]
        assert ready["cloud_status"] == "ready"

        cloud.events.clear()
        second = add_cover(store, root, local_id, b"2")
        replaced = sync.sync_local(local_id, cloud_id)
        assert replaced.deleted == 1 and replaced.uploaded == 1
        assert cloud.events.index("finalize_delete") < cloud.events.index("prepare")
        visible = store.list_managed_assets(local_id)
        assert len(visible) == 1 and visible[0]["local_asset_id"] == second["local_asset_id"]

        # Article deletion removes cloud assets first but retains the local
        # source until the cloud article delete itself is confirmed.
        sync.delete_all_for_article(local_id, cloud_id)
        preserved = store.list_managed_assets(local_id, include_deleted=True)
        assert len(preserved) == 1 and preserved[0]["cloud_status"] == "local_only"
        assert store.managed_file_path(local_id, preserved[0]).is_file()
        assert not cloud.rows and not cloud.objects


def test_failure_preserves_local_and_no_automatic_retry() -> None:
    with tempfile.TemporaryDirectory(prefix="aas_phase5c_failure_") as temp_name:
        root = Path(temp_name)
        store = ArticleImageStore(root / "images")
        cloud = FakeAssetCloud()
        cloud.fail_upload = True
        asset = add_cover(store, root, "local")
        sync = CloudAssetSyncCoordinator(store, cloud, actor())
        cloud_id = str(uuid4())
        try:
            sync.sync_local("local", cloud_id)
        except CloudArticleError as exc:
            assert exc.category == "network_unavailable"
        else:
            raise AssertionError("failed upload was accepted")
        saved = store.list_managed_assets("local", include_deleted=True)[0]
        assert saved["local_asset_id"] == asset["local_asset_id"]
        assert saved["cloud_status"] == "error"
        assert store.managed_file_path("local", saved).read_bytes() == PNG
        calls = list(cloud.events)
        assert calls == ["prepare", "upload", "finalize"]
        assert "signed_url" not in store.metadata_path("local").read_text(encoding="utf-8").lower()

        # Simulate an upload that committed remotely but lost its response.
        # Delete must finalize that pending object, then use the normal
        # begin-delete -> Storage delete -> finalize-delete lifecycle.
        pending_row = next(iter(cloud.rows.values()))
        cloud.objects[pending_row["storage_path"]] = PNG
        store.mark_delete("local", asset["local_asset_id"])
        cloud.fail_upload = False
        deleted = sync.sync_local("local", cloud_id)
        assert deleted.deleted == 1
        assert not store.list_managed_assets("local", include_deleted=True)
        assert not cloud.rows and not cloud.objects


def test_signed_url_is_absolute_and_same_origin() -> None:
    service = CloudArticleAssetService(AuthConfig(supabase_url="https://project.supabase.co", anon_key="anon"))
    assert service._absolute_storage_url("/object/sign/article-assets/a.png?token=x") == (
        "https://project.supabase.co/storage/v1/object/sign/article-assets/a.png?token=x"
    )
    assert service._absolute_storage_url("/storage/v1/object/sign/article-assets/a.png?token=x") == (
        "https://project.supabase.co/storage/v1/object/sign/article-assets/a.png?token=x"
    )
    try:
        service._absolute_storage_url("https://attacker.invalid/object/sign/a")
    except CloudArticleError as exc:
        assert exc.code == "invalid_response"
    else:
        raise AssertionError("cross-origin signed URL was accepted")


def test_prepare_uses_rpc_storage_column_names() -> None:
    service = CloudArticleAssetService(AuthConfig(supabase_url="https://project.supabase.co", anon_key="anon"))
    cloud_id = str(uuid4())
    asset_id = str(uuid4())
    storage_path = f"user/{cloud_id}/{asset_id}.png"
    service._require_entitlement = lambda _actor: None
    service._rpc = lambda *_args, **_kwargs: [{
        "asset_id": asset_id,
        "storage_bucket": "article-assets",
        "storage_path": storage_path,
        "status": "pending_upload",
    }]
    prepared = service.prepare(actor(), cloud_id, {
        "asset_type": "cover",
        "original_filename": "fixture.png",
        "mime_type": "image/png",
        "size_bytes": len(PNG),
        "sort_order": 0,
    })
    assert prepared["storage_bucket"] == "article-assets"
    assert prepared["storage_path"] == storage_path


def test_remote_cover_yields_to_explicit_local_replacement() -> None:
    with tempfile.TemporaryDirectory(prefix="aas_phase5c_reconcile_") as temp_name:
        root = Path(temp_name)
        cloud_id = str(uuid4())
        cloud = FakeAssetCloud()
        remote_source = root / "remote.png"
        remote_source.write_bytes(PNG + b"remote")
        remote_meta = {
            "asset_type": "cover",
            "original_filename": "remote.png",
            "mime_type": "image/png",
            "size_bytes": remote_source.stat().st_size,
            "sort_order": 0,
            "insertion_marker": None,
            "alt_text": "",
            "checksum_sha256": "a" * 64,
        }
        prepared = cloud.prepare(actor(), cloud_id, remote_meta)
        cloud.upload(
            actor(),
            prepared["storage_bucket"],
            prepared["storage_path"],
            remote_source,
            "image/png",
        )
        cloud.finalize(actor(), prepared["asset_id"], remote_meta["checksum_sha256"])

        store = ArticleImageStore(root / "managed")
        local = add_cover(store, root, "local", b"local")
        sync = CloudAssetSyncCoordinator(store, cloud, actor())
        sync.refresh_remote("local", cloud_id)
        all_assets = store.list_managed_assets("local", include_deleted=True)
        remote = next(item for item in all_assets if item.get("cloud_asset_id"))
        assert remote["desired_state"] == "delete"
        assert store.list_managed_assets("local")[0]["local_asset_id"] == local["local_asset_id"]
        result = sync.sync_local("local", cloud_id)
        assert result.deleted == 1 and result.uploaded == 1 and result.pending == 0
        ready = store.list_managed_assets("local")
        assert len(ready) == 1 and ready[0]["local_asset_id"] == local["local_asset_id"]


def main() -> None:
    test_upload_replace_delete_order()
    test_failure_preserves_local_and_no_automatic_retry()
    test_signed_url_is_absolute_and_same_origin()
    test_prepare_uses_rpc_storage_column_names()
    test_remote_cover_yields_to_explicit_local_replacement()
    print("PHASE5C_CLOUD_ASSET_SYNC: PASS")


if __name__ == "__main__":
    main()
