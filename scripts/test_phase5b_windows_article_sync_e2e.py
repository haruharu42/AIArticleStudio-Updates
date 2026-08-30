from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def _bootstrap_source_paths() -> str:
    """Prefer the complete installed runtime over the recovery worktree.

    The recovery worktree intentionally omits unchanged Windows modules such
    as core/config.py.  Product code updated by Phase 5B is copied to both the
    worktree and installed runtime, so authenticated E2E must import the exact
    installed package first and use the worktree only as a fallback.
    """

    install_root = ""
    try:
        argument_index = sys.argv.index("--install-root")
    except ValueError:
        argument_index = -1
    if argument_index >= 0 and argument_index + 1 < len(sys.argv):
        install_root = str(sys.argv[argument_index + 1]).strip()
    if not install_root:
        local_app_data = str(os.environ.get("LOCALAPPDATA") or "").strip()
        if local_app_data:
            install_root = str(Path(local_app_data) / "AIArticleStudio")

    if install_root:
        runtime_source = Path(install_root) / "src"
        runtime_config = (
            runtime_source / "ai_article_studio" / "core" / "config.py"
        )
        if runtime_config.is_file():
            sys.path.insert(0, str(runtime_source))
            return "installed_runtime"

    repository_source = ROOT / "src"
    sys.path.insert(0, str(repository_source))
    return "repository"


SOURCE_BOOTSTRAP = _bootstrap_source_paths()

from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthConfig,
    SessionStore,
    SupabaseAuthService,
)
from ai_article_studio.core.cloud_article_serializer import (  # noqa: E402
    serialize_article_record,
)
from ai_article_studio.core.cloud_article_sync import (  # noqa: E402
    CloudArticleSyncCoordinator,
)
from ai_article_studio.core.cloud_articles import (  # noqa: E402
    CloudArticleError,
    CloudArticleService,
    WINDOWS_PRODUCT_CODE,
)
from ai_article_studio.core.db import ArticleDB  # noqa: E402


def restore_actor(config: AuthConfig, session_path: Path):
    service = SupabaseAuthService(config, SessionStore(session_path))
    actor = service.restore()
    if actor is None:
        raise RuntimeError("authenticated session restore failed")
    return service, actor


def fixture_record() -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "article_id": "phase5b-e2e-local-fixture",
        "created_at": now,
        "updated_at": now,
        "status": "完成",
        "title": "Phase 5B sync fixture",
        "theme": "Phase 5B sync fixture",
        "request": {
            "platform": "note",
            "article_type": "有料",
            "genre": "AI副業",
            "subgenre": "AIライティング副業",
            "target_age": "30代",
            "target_gender": "指定なし",
            "reader_level": "初心者",
            "price_jpy": 980,
            "affiliate_enabled": False,
            "future_request": {"preserve": True},
        },
        "content": {
            "blocks": [{"markdown": "Phase 5B current body"}],
            "web_original": "Phase 5B source body",
            "web_publish": "Phase 5B publish body",
            "future_content": {"preserve": True},
        },
        "image_plan": {
            "enabled": True,
            "target": "both",
            "illustration_count": 3,
            "style": "anime",
            "insertion_markers": ["[挿絵01]", "[挿絵02]", "[挿絵03]"],
        },
        "future_record": {"preserve": True},
        "generation_history": [{"stage": "phase5b_e2e"}],
        "revision_history": [],
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
        "phase": "5B",
        "scope": "Windows authenticated article synchronization E2E",
        "overall": "FAIL",
        "service_role_used": False,
        "secrets_included": False,
        "article_bodies_included": False,
        "cloud_ids_included": False,
        "real_local_articles_used": False,
        "write_retry_used": False,
        "existing_local_articles_migrated": False,
        "source_bootstrap": SOURCE_BOOTSTRAP,
        "temporary_entitlement_cleaned": False,
        "fixture_cleaned": False,
        "tests": {},
    }

    config = AuthConfig.load(args.install_root)
    admin_auth, admin = restore_actor(config, args.admin_session_bin)
    user_auth, user = restore_actor(config, args.user_session_bin)
    if (
        admin.profile.aas_user_id != "AAS-000001"
        or admin.profile.role != "admin"
        or admin.profile.status != "active"
    ):
        raise RuntimeError("admin session is not AAS-000001 active admin")
    if (
        user.profile.aas_user_id != "AAS-000002"
        or user.profile.role != "user"
        or user.profile.status != "active"
    ):
        raise RuntimeError("user session is not AAS-000002 active user")
    report["tests"]["authenticated_sessions"] = "PASS"

    cloud = CloudArticleService(config)
    cloud_id = ""
    cloud_revision = 0
    entitlement_granted = False
    initial_access = cloud.can_access_windows(user)
    initial_count: int | None = None

    try:
        if not initial_access:
            cloud._rpc(
                admin,
                "admin_grant_entitlement",
                {
                    "p_target_user_id": user.profile.id,
                    "p_product_code": WINDOWS_PRODUCT_CODE,
                    "p_expires_at": None,
                    "p_sales_channel": "phase5b-test",
                    "p_external_reference": "phase5b-windows-sync-e2e",
                },
            )
            entitlement_granted = True
        if not cloud.can_access_windows(user):
            raise AssertionError("Windows entitlement gate did not allow the fixture")
        report["tests"]["entitlement_gate"] = "PASS"

        # A general user without a Windows entitlement is an expected initial
        # state.  Read the protected quota only after the temporary test grant
        # has made the same product gate pass as the Windows application.
        initial_quota = cloud.quota_summary(user)
        initial_count = int(initial_quota.get("current_articles") or 0)

        with tempfile.TemporaryDirectory(prefix="aas_phase5b_e2e_") as temp_name:
            primary_db = ArticleDB(Path(temp_name) / "primary.db")
            local_record = fixture_record()
            primary_db.save(local_record)
            sync = CloudArticleSyncCoordinator(
                primary_db,
                cloud,
                user,
                auth_service=user_auth,
            )

            created = sync.push_local(local_record["article_id"])
            cloud_id = created.cloud_article_id
            cloud_revision = int(created.cloud_revision or 0)
            mapping = primary_db.get_cloud_sync(local_record["article_id"])
            if (
                created.action != "created"
                or cloud_revision != 1
                or mapping is None
                or mapping.get("sync_status") != "synced"
            ):
                raise AssertionError("local-to-cloud create mapping failed")
            report["tests"]["local_save_then_atomic_create"] = "PASS"

            read_article = cloud.read_article(user, cloud_id)
            read_workspace = cloud.read_workspace(user, cloud_id)
            if read_article.get("body") != local_record["content"]["blocks"][0]["markdown"]:
                raise AssertionError("owner cloud body read mismatch")
            if read_workspace.get("source_body") != local_record["content"]["web_original"]:
                raise AssertionError("owner workspace source body mismatch")
            if int((read_workspace.get("image_plan_json") or {}).get("illustration_count") or 0) != 3:
                raise AssertionError("owner image plan read mismatch")
            report["tests"]["owner_read_workspace"] = "PASS"

            if any(str(row.get("id") or "") == cloud_id for row in cloud.list_articles(admin)):
                raise AssertionError("admin RLS bypass exposed another user's article")
            report["tests"]["cross_user_list_rejected"] = "PASS"

            cache_db = ArticleDB(Path(temp_name) / "secondary-cache.db")
            cache_sync = CloudArticleSyncCoordinator(
                cache_db,
                cloud,
                user,
                auth_service=user_auth,
            )
            pulled = cache_sync.pull_cloud()
            cache_mapping = cache_db.get_cloud_sync_by_cloud_id(cloud_id)
            if pulled.imported != 1 or cache_mapping is None:
                raise AssertionError("cloud-to-local cache import failed")
            cached = cache_db.load(cache_mapping["local_article_id"])
            if (
                cached is None
                or cached.get("future_record") != {"preserve": True}
                or (cached.get("request") or {}).get("future_request") != {"preserve": True}
                or int((cached.get("image_plan") or {}).get("illustration_count") or 0) != 3
            ):
                raise AssertionError("cloud cache round trip lost workspace fields")
            report["tests"]["cloud_pull_local_cache"] = "PASS"

            edited = primary_db.load(local_record["article_id"])
            edited["title"] = "Phase 5B sync fixture updated"
            edited["content"]["blocks"][0]["markdown"] = "Phase 5B updated body"
            primary_db.save(edited)
            if primary_db.get_cloud_sync(local_record["article_id"])["sync_status"] != "pending_update":
                raise AssertionError("local edit was not marked pending_update")
            updated = sync.push_local(local_record["article_id"])
            cloud_revision = int(updated.cloud_revision or 0)
            if updated.action != "updated" or cloud_revision != 2:
                raise AssertionError("atomic update did not advance revision")
            report["tests"]["local_edit_atomic_update"] = "PASS"

            remote_record = fixture_record()
            remote_record["title"] = "Phase 5B independent remote update"
            remote_serialized = serialize_article_record(
                remote_record,
                image_plan=remote_record["image_plan"],
            )
            remote_updated = cloud.update(
                user,
                cloud_id,
                cloud_revision,
                remote_serialized,
            )
            cloud_revision = int((remote_updated.get("article") or {}).get("revision") or 0)
            if cloud_revision != 3:
                raise AssertionError("independent update did not advance revision")

            conflict_record = primary_db.load(local_record["article_id"])
            conflict_record["title"] = "Phase 5B local conflict must survive"
            primary_db.save(conflict_record)
            try:
                sync.push_local(local_record["article_id"])
            except CloudArticleError as exc:
                if exc.category != "revision_conflict" or exc.code != "40001":
                    raise AssertionError(
                        f"unexpected conflict category: {exc.category}/{exc.code}"
                    ) from exc
            else:
                raise AssertionError("stale revision overwrote the cloud article")
            conflict_mapping = primary_db.get_cloud_sync(local_record["article_id"])
            if (
                conflict_mapping.get("sync_status") != "conflict"
                or primary_db.load(local_record["article_id"])["title"]
                != "Phase 5B local conflict must survive"
            ):
                raise AssertionError("revision conflict did not preserve the local edit")
            report["tests"]["revision_conflict_preserves_local"] = "PASS"

            # Resolve only the isolated test metadata to exercise the normal
            # cloud-first delete path.  No real Windows article is involved.
            primary_db.set_cloud_mapping(
                local_record["article_id"],
                cloud_id,
                cloud_revision,
                sync_status="synced",
            )
            if not sync.delete_local(local_record["article_id"]):
                raise AssertionError("mapped cloud-first delete returned false")
            if primary_db.load(local_record["article_id"]) is not None:
                raise AssertionError("local cache remained after confirmed cloud delete")
            cloud_id = ""
            report["tests"]["cloud_first_delete"] = "PASS"

        if initial_count is None:
            raise AssertionError("initial cloud article count was not captured")
        final_count = int(cloud.quota_summary(user).get("current_articles") or 0)
        if final_count != initial_count:
            raise AssertionError("cloud article fixture count was not restored")
        report["fixture_cleaned"] = True
    finally:
        if cloud_id:
            try:
                cloud.delete(user, cloud_id, cloud_revision)
                cloud_id = ""
                report["fixture_cleaned"] = True
            except Exception as exc:
                report["tests"]["fixture_cleanup"] = f"FAIL:{type(exc).__name__}"
        if entitlement_granted:
            try:
                cloud._rpc(
                    admin,
                    "admin_revoke_entitlement",
                    {
                        "p_target_user_id": user.profile.id,
                        "p_product_code": WINDOWS_PRODUCT_CODE,
                    },
                )
                report["temporary_entitlement_cleaned"] = not cloud.can_access_windows(user)
            except Exception as exc:
                report["tests"]["entitlement_cleanup"] = f"FAIL:{type(exc).__name__}"
        else:
            report["temporary_entitlement_cleaned"] = True

    if not report["fixture_cleaned"]:
        raise RuntimeError("article/workspace fixture cleanup failed")
    if not report["temporary_entitlement_cleaned"]:
        raise RuntimeError("temporary entitlement cleanup failed")

    report["overall"] = "PASS"
    write_report(args.report, report)
    print("PHASE5B_WINDOWS_ARTICLE_SYNC_E2E: PASS")
    print(f"Sanitized report: {args.report}")
    print("JWTs, passwords, article bodies, cloud IDs, and real local articles were not displayed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        # Keep a sanitized failure report even when setup fails before the main
        # report object can be finalized.  Never copy exception messages here:
        # an upstream library could include a URL or response detail.
        try:
            report_index = sys.argv.index("--report") + 1
            failure_report = Path(sys.argv[report_index])
            write_report(
                failure_report,
                {
                    "phase": "5B",
                    "scope": "Windows authenticated article synchronization E2E",
                    "overall": "FAIL",
                    "failure_type": type(exc).__name__,
                    "service_role_used": False,
                    "secrets_included": False,
                    "article_bodies_included": False,
                    "cloud_ids_included": False,
                    "real_local_articles_used": False,
                    "write_retry_used": False,
                },
            )
        except Exception:
            pass
        raise
