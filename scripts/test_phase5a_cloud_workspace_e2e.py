from __future__ import annotations

import argparse
from datetime import datetime, timezone
import getpass
import json
from pathlib import Path
import sys
from urllib import error, request
import webbrowser


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthConfig,
    ManagedUserProfile,
    SessionStore,
    SupabaseAuthService,
)
from ai_article_studio.core.cloud_article_serializer import (  # noqa: E402
    serialize_article_record,
)
from ai_article_studio.core.cloud_articles import (  # noqa: E402
    CloudArticleError,
    CloudArticleService,
    WINDOWS_PRODUCT_CODE,
)


def restore_actor(
    config,
    session_path: Path,
    *,
    bootstrap_with_password: bool = False,
    bootstrap_with_google: bool = False,
):
    if bootstrap_with_password and bootstrap_with_google:
        raise RuntimeError("choose only one user session bootstrap method")
    service = SupabaseAuthService(config, SessionStore(session_path))
    actor = service.restore()
    if actor is None and bootstrap_with_password:
        print("The separate user session requires a fresh normal Auth login.")
        print("Email and password input are hidden and are not written to the report.")
        email = getpass.getpass("AAS-000002 login email (hidden): ").strip()
        password = getpass.getpass("AAS-000002 password (hidden): ")
        try:
            actor = service.sign_in_with_password(email, password)
        finally:
            email = ""
            password = ""
    if actor is None and bootstrap_with_google:
        print("The separate user session will use the normal Google OAuth flow.")
        print("Google account selection is forced; choose the account linked to AAS-000002.")
        print("OAuth codes and tokens are not displayed or written to the report.")

        def open_google_account_selector(authorization_url: str):
            separator = "&" if "?" in authorization_url else "?"
            return webbrowser.open(
                f"{authorization_url}{separator}prompt=select_account"
            )

        actor = service.sign_in_with_google(open_google_account_selector)
    if actor is None:
        raise RuntimeError("authenticated session restore failed")
    return service, actor


def expect_cloud_error(label, category, operation):
    try:
        operation()
    except CloudArticleError as exc:
        if category is not None and exc.category != category:
            raise AssertionError(
                f"{label}: expected {category}, got {exc.category}/{exc.code}"
            ) from exc
        return
    raise AssertionError(f"{label}: operation unexpectedly succeeded")


def anon_workspace_rejected(config, article_id: str) -> None:
    payload = json.dumps({"p_article_id": article_id}).encode("utf-8")
    http_request = request.Request(
        f"{config.supabase_url}/rest/v1/rpc/get_article_workspace",
        data=payload,
        headers={
            "apikey": config.anon_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        request.urlopen(http_request, timeout=20).read()
    except error.HTTPError as exc:
        if exc.code not in {401, 403, 404}:
            raise AssertionError(f"anon rejection returned HTTP {exc.code}") from exc
        return
    raise AssertionError("anon workspace call unexpectedly succeeded")


def fixture_record() -> dict:
    return {
        "article_id": "phase5a-e2e-local-fixture",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "status": "完成",
        "title": "Phase 5A E2E fixture",
        "theme": "Phase 5A E2E fixture",
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
        },
        "content": {
            "blocks": [{"markdown": "Phase 5A current body"}],
            "web_original": "Phase 5A source body",
            "web_publish": "Phase 5A publish body",
            "source": "phase5a_e2e",
        },
        "generation_history": [{"stage": "phase5a_e2e"}],
        "revision_history": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install-root", type=Path, required=True)
    parser.add_argument("--user-session-bin", type=Path, required=True)
    parser.add_argument("--admin-session-bin", type=Path, required=True)
    bootstrap_group = parser.add_mutually_exclusive_group()
    bootstrap_group.add_argument("--bootstrap-user-session", action="store_true")
    bootstrap_group.add_argument("--bootstrap-user-google", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    report = {
        "phase": "5A",
        "scope": "authenticated article workspace E2E",
        "overall": "FAIL",
        "service_role_used": False,
        "secrets_included": False,
        "article_bodies_included": False,
        "real_local_articles_used": False,
        "password_displayed": False,
        "user_session_bootstrap": (
            "google"
            if args.bootstrap_user_google
            else "email_password"
            if args.bootstrap_user_session
            else "none"
        ),
        "temporary_entitlement_cleaned": False,
        "fixture_cleaned": False,
        "tests": {},
    }

    config = AuthConfig.load(args.install_root)
    admin_auth, admin = restore_actor(config, args.admin_session_bin)
    _user_auth, user = restore_actor(
        config,
        args.user_session_bin,
        bootstrap_with_password=args.bootstrap_user_session,
        bootstrap_with_google=args.bootstrap_user_google,
    )
    if admin.profile.aas_user_id != "AAS-000001" or admin.profile.role != "admin":
        raise RuntimeError("admin session is not AAS-000001 active admin")
    if user.profile.aas_user_id != "AAS-000002" or user.profile.role != "user":
        raise RuntimeError("user session is not AAS-000002 active user")

    cloud = CloudArticleService(config)
    article_id = ""
    revision = 0
    entitlement_granted = False
    user_suspended = False
    managed_user = ManagedUserProfile(
        id=user.profile.id,
        aas_user_id=user.profile.aas_user_id,
        display_name=user.profile.display_name,
        role=user.profile.role,
        status=user.profile.status,
        created_at=user.profile.created_at,
    )

    try:
        if cloud.can_access_windows(user):
            raise RuntimeError("AAS-000002 already has Windows entitlement")
        report["tests"]["entitlement_initial_false"] = "PASS"

        cloud._rpc(
            admin,
            "admin_grant_entitlement",
            {
                "p_target_user_id": user.profile.id,
                "p_product_code": WINDOWS_PRODUCT_CODE,
                "p_expires_at": None,
                "p_sales_channel": "phase5a-test",
                "p_external_reference": "phase5a-workspace-e2e",
            },
        )
        entitlement_granted = True
        if not cloud.can_access_windows(user):
            raise AssertionError("temporary entitlement did not become active")
        report["tests"]["temporary_entitlement"] = "PASS"

        if not cloud.can_access_windows(admin):
            raise AssertionError("active admin entitlement bypass failed")
        report["tests"]["admin_entitlement_bypass"] = "PASS"

        quota = cloud.quota_summary(user)
        if int(quota.get("current_articles") or 0) != 0:
            raise AssertionError("cloud fixture precondition expected zero articles")
        report["tests"]["quota_summary"] = "PASS"

        serialized = serialize_article_record(
            fixture_record(),
            image_plan={
                "enabled": True,
                "target": "both",
                "illustration_count": 3,
                "style": "anime",
            },
        )
        created = cloud.create(user, serialized)
        article = dict(created.get("article") or {})
        workspace = dict(created.get("workspace") or {})
        article_id = str(article.get("id") or "")
        revision = int(article.get("revision") or 0)
        if not article_id or revision != 1:
            raise AssertionError("create did not return revision 1")
        if workspace.get("article_id") != article_id:
            raise AssertionError("workspace article ID mismatch")
        report["tests"]["atomic_create"] = "PASS"

        read_article = cloud.read_article(user, article_id)
        read_workspace = cloud.read_workspace(user, article_id)
        if read_article.get("body") != "Phase 5A current body":
            raise AssertionError("current body mismatch")
        if read_workspace.get("source_body") != "Phase 5A source body":
            raise AssertionError("source body mismatch")
        if read_workspace.get("publish_body") != "Phase 5A publish body":
            raise AssertionError("publish body mismatch")
        if int(read_workspace.get("image_plan_json", {}).get("illustration_count")) != 3:
            raise AssertionError("image plan mismatch")
        report["tests"]["owner_read"] = "PASS"

        updated_record = fixture_record()
        updated_record["title"] = "Phase 5A E2E fixture updated"
        updated_record["content"]["blocks"][0]["markdown"] = "Updated current body"
        updated_record["content"]["web_original"] = "Updated source body"
        updated_record["content"]["web_publish"] = "Updated publish body"
        updated_serialized = serialize_article_record(
            updated_record,
            image_plan={"enabled": True, "illustration_count": 2},
        )
        updated = cloud.update(user, article_id, revision, updated_serialized)
        revision = int(dict(updated.get("article") or {}).get("revision") or 0)
        if revision != 2:
            raise AssertionError("update did not advance revision to 2")
        if int(dict(updated.get("workspace") or {}).get("workspace_version") or 0) != 2:
            raise AssertionError("workspace version did not advance to 2")
        report["tests"]["atomic_update"] = "PASS"

        expect_cloud_error(
            "stale revision",
            "revision_conflict",
            lambda: cloud.update(user, article_id, 1, updated_serialized),
        )
        report["tests"]["revision_40001"] = "PASS"

        expect_cloud_error(
            "cross-user article read",
            "not_found",
            lambda: cloud.read_article(admin, article_id),
        )
        expect_cloud_error(
            "cross-user workspace read",
            None,
            lambda: cloud.read_workspace(admin, article_id),
        )
        expect_cloud_error(
            "cross-user workspace update",
            None,
            lambda: cloud.update(admin, article_id, revision, updated_serialized),
        )
        report["tests"]["cross_user_rejected"] = "PASS"

        anon_workspace_rejected(config, article_id)
        report["tests"]["anon_rejected"] = "PASS"

        managed_user = admin_auth.admin_set_user_status(
            admin,
            managed_user,
            "suspended",
        )
        user_suspended = True
        expect_cloud_error(
            "inactive workspace read",
            "inactive",
            lambda: cloud._rpc(
                user,
                "get_article_workspace",
                {"p_article_id": article_id},
            ),
        )
        report["tests"]["inactive_rejected"] = "PASS"

        managed_user = admin_auth.admin_set_user_status(
            admin,
            managed_user,
            "active",
        )
        user_suspended = False

        deleted = cloud.delete(user, article_id, revision)
        if deleted != article_id:
            raise AssertionError("delete returned unexpected article ID")
        article_id = ""
        report["tests"]["cascade_delete"] = "PASS"
        report["fixture_cleaned"] = True
    finally:
        if user_suspended:
            try:
                admin_auth.admin_set_user_status(admin, managed_user, "active")
                user_suspended = False
            except Exception as exc:
                report["tests"]["status_cleanup"] = f"FAIL:{type(exc).__name__}"
        if article_id:
            try:
                cloud.delete(user, article_id, revision)
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

    if user_suspended:
        raise RuntimeError("AAS-000002 status cleanup failed")
    if not report["fixture_cleaned"]:
        raise RuntimeError("article/workspace fixture cleanup failed")
    if not report["temporary_entitlement_cleaned"]:
        raise RuntimeError("temporary entitlement cleanup failed")

    report["overall"] = "PASS"
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PHASE5A_CLOUD_WORKSPACE_E2E: PASS")
    print(f"Sanitized report: {args.report}")
    print("JWTs, passwords, article bodies, and cloud IDs were not displayed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
