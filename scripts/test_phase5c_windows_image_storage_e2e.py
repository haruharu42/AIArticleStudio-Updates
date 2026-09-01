from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
from urllib import request


ROOT = Path(__file__).resolve().parents[1]


def _bootstrap_source_paths() -> str:
    install_root = ""
    try:
        index = sys.argv.index("--install-root")
    except ValueError:
        index = -1
    if index >= 0 and index + 1 < len(sys.argv):
        install_root = str(sys.argv[index + 1]).strip()
    if not install_root and os.environ.get("LOCALAPPDATA"):
        install_root = str(Path(os.environ["LOCALAPPDATA"]) / "AIArticleStudio")
    if install_root and (Path(install_root) / "src/ai_article_studio/core/config.py").is_file():
        sys.path.insert(0, str(Path(install_root) / "src"))
        return "installed_runtime"
    sys.path.insert(0, str(ROOT / "src"))
    return "repository"


SOURCE_BOOTSTRAP = _bootstrap_source_paths()

from ai_article_studio.core.auth_service import AuthConfig, SessionStore, SupabaseAuthService  # noqa: E402
from ai_article_studio.core.cloud_article_serializer import serialize_article_record  # noqa: E402
from ai_article_studio.core.cloud_articles import CloudArticleService, WINDOWS_PRODUCT_CODE  # noqa: E402
from ai_article_studio.core.cloud_assets import CloudArticleAssetService, CloudAssetSyncCoordinator  # noqa: E402
from ai_article_studio.core.image_assets import ArticleImageStore  # noqa: E402


PNG = b"\x89PNG\r\n\x1a\n" + b"AIArticleStudio Phase 5C authenticated fixture"


def restore_actor(config: AuthConfig, session_path: Path):
    service = SupabaseAuthService(config, SessionStore(session_path))
    actor = service.restore()
    if actor is None:
        raise RuntimeError("authenticated session restore failed")
    return service, actor


def fixture_record() -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "article_id": "phase5c-image-e2e-local-fixture",
        "created_at": now,
        "updated_at": now,
        "status": "完成",
        "title": "Phase 5C image fixture",
        "theme": "Phase 5C image fixture",
        "request": {"platform": "note", "article_type": "無料", "genre": "テスト"},
        "content": {"blocks": [{"markdown": "Phase 5C isolated fixture"}], "web_original": "fixture", "web_publish": "fixture"},
        "image_plan": {"enabled": True, "target": "eyecatch", "illustration_count": 0},
        "cost_actual": {"total_jpy": 0},
    }


def write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install-root", type=Path, required=True)
    parser.add_argument("--user-session-bin", type=Path, required=True)
    parser.add_argument("--admin-session-bin", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = {
        "phase": "5C",
        "scope": "Windows image UI private Storage authenticated E2E",
        "overall": "FAIL",
        "source_bootstrap": SOURCE_BOOTSTRAP,
        "service_role_used": False,
        "secrets_included": False,
        "cloud_ids_included": False,
        "real_local_articles_used": False,
        "existing_local_articles_migrated": False,
        "write_retry_used": False,
        "temporary_entitlement_cleaned": False,
        "fixture_cleaned": False,
        "tests": {},
    }
    config = AuthConfig.load(args.install_root)
    admin_auth, admin = restore_actor(config, args.admin_session_bin)
    user_auth, user = restore_actor(config, args.user_session_bin)
    if admin.profile.aas_user_id != "AAS-000001" or admin.profile.role != "admin" or admin.profile.status != "active":
        raise RuntimeError("admin session is not AAS-000001 active admin")
    if user.profile.aas_user_id != "AAS-000002" or user.profile.role != "user" or user.profile.status != "active":
        raise RuntimeError("user session is not AAS-000002 active user")
    report["tests"]["authenticated_sessions"] = "PASS"

    articles = CloudArticleService(config)
    assets = CloudArticleAssetService(config)
    cloud_article_id = ""
    cloud_revision = 0
    entitlement_granted = False
    try:
        if not articles.can_access_windows(user):
            articles._rpc(admin, "admin_grant_entitlement", {
                "p_target_user_id": user.profile.id,
                "p_product_code": WINDOWS_PRODUCT_CODE,
                "p_expires_at": None,
                "p_sales_channel": "phase5c-test",
                "p_external_reference": "phase5c-windows-image-storage-e2e",
            })
            entitlement_granted = True
        if not articles.can_access_windows(user):
            raise AssertionError("Windows entitlement gate did not allow fixture")
        report["tests"]["entitlement_gate"] = "PASS"

        created = articles.create(user, serialize_article_record(fixture_record(), image_plan=fixture_record()["image_plan"]))
        cloud_article_id = str(created["article"]["id"])
        cloud_revision = int(created["article"]["revision"])
        with tempfile.TemporaryDirectory(prefix="aas_phase5c_e2e_") as temp_name:
            temp = Path(temp_name)
            source = temp / "fixture.png"
            source.write_bytes(PNG)
            image_store = ArticleImageStore(temp / "managed")
            image_store.add_managed_asset("local-fixture", source, asset_type="cover", alt_text="Phase 5C fixture")
            sync = CloudAssetSyncCoordinator(image_store, assets, user, auth_service=user_auth)
            result = sync.sync_local("local-fixture", cloud_article_id)
            if result.uploaded != 1 or result.pending != 0:
                raise AssertionError("prepare/upload/finalize did not reach ready")
            local_asset = image_store.list_managed_assets("local-fixture")[0]
            if local_asset.get("cloud_status") != "ready":
                raise AssertionError("local asset state is not ready")
            report["tests"]["prepare_upload_finalize"] = "PASS"

            owner_rows = assets.list_assets(user, cloud_article_id)
            if len(owner_rows) != 1 or owner_rows[0].get("status") != "ready":
                raise AssertionError("owner asset metadata read mismatch")
            if assets.list_assets(admin, cloud_article_id):
                raise AssertionError("cross-user asset metadata was exposed")
            report["tests"]["owner_and_cross_user_rls"] = "PASS"

            downloaded = assets.download(user, "article-assets", str(local_asset["storage_path"]))
            if downloaded != PNG:
                raise AssertionError("authenticated Storage download mismatch")
            signed_url = assets.create_signed_url(user, "article-assets", str(local_asset["storage_path"]), expires_in=60)
            with request.urlopen(signed_url, timeout=20) as response:
                if response.read() != PNG:
                    raise AssertionError("signed URL download mismatch")
            if "signed_url" in image_store.metadata_path("local-fixture").read_text(encoding="utf-8").lower():
                raise AssertionError("signed URL was persisted")
            report["tests"]["authenticated_read_and_ephemeral_signed_url"] = "PASS"

            image_store.mark_delete("local-fixture", str(local_asset["local_asset_id"]))
            deleted = sync.sync_local("local-fixture", cloud_article_id)
            if deleted.deleted != 1 or assets.list_assets(user, cloud_article_id):
                raise AssertionError("Storage-first asset delete did not finish")
            report["tests"]["storage_first_delete"] = "PASS"

        articles.delete(user, cloud_article_id, cloud_revision)
        cloud_article_id = ""
        report["fixture_cleaned"] = True
    finally:
        if cloud_article_id:
            try:
                # E2E owns this isolated fixture; remove any assets before article.
                for row in assets.list_assets(user, cloud_article_id):
                    status = str(row.get("status") or "")
                    if status == "pending_upload":
                        try:
                            assets.cancel_pending(user, str(row["id"]))
                            continue
                        except Exception:
                            row = assets.finalize(user, str(row["id"]), "")
                            status = "ready"
                    if status == "ready":
                        row = assets.begin_delete(user, str(row["id"]))
                    assets.delete_object(user, str(row["storage_bucket"]), str(row["storage_path"]))
                    assets.finalize_delete(user, str(row["id"]))
                articles.delete(user, cloud_article_id, cloud_revision)
                report["fixture_cleaned"] = True
            except Exception as exc:
                report["tests"]["fixture_cleanup"] = f"FAIL:{type(exc).__name__}"
        if entitlement_granted:
            try:
                articles._rpc(admin, "admin_revoke_entitlement", {"p_target_user_id": user.profile.id, "p_product_code": WINDOWS_PRODUCT_CODE})
                report["temporary_entitlement_cleaned"] = not articles.can_access_windows(user)
            except Exception as exc:
                report["tests"]["entitlement_cleanup"] = f"FAIL:{type(exc).__name__}"
        else:
            report["temporary_entitlement_cleaned"] = True
    if not report["fixture_cleaned"] or not report["temporary_entitlement_cleaned"]:
        raise RuntimeError("Phase 5C fixture cleanup failed")
    report["overall"] = "PASS"
    write_report(args.report, report)
    print("PHASE5C_WINDOWS_IMAGE_STORAGE_E2E: PASS")
    print(f"Sanitized report: {args.report}")
    print("JWTs, passwords, cloud IDs, signed URLs, and real local articles were not displayed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        try:
            report_path = Path(sys.argv[sys.argv.index("--report") + 1])
            write_report(report_path, {
                "phase": "5C",
                "scope": "Windows image UI private Storage authenticated E2E",
                "overall": "FAIL",
                "failure_type": type(exc).__name__,
                "service_role_used": False,
                "secrets_included": False,
                "cloud_ids_included": False,
                "real_local_articles_used": False,
                "write_retry_used": False,
            })
        except Exception:
            pass
        raise
