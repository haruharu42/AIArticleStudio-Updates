import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("release migration stores per-user versions behind locked RPCs", async () => {
  const migration = await readRepo("supabase/migrations/20260919114658_pwa_release_update_management.sql");

  for (const table of ["app_releases", "app_release_channels", "user_release_state", "app_release_audit"]) {
    assert.match(migration, new RegExp("create table if not exists public\\." + table));
    assert.match(migration, new RegExp("alter table public\\." + table + " force row level security"));
    assert.match(migration, new RegExp("revoke all on table public\\." + table + " from anon, authenticated"));
  }

  for (const rpc of [
    "get_my_app_release_state",
    "accept_app_release",
    "admin_list_app_releases",
    "admin_create_app_release",
    "admin_publish_app_release",
    "admin_rollback_app_release",
  ]) {
    assert.match(migration, new RegExp("function public\\." + rpc));
  }

  assert.match(migration, /private\.is_active_admin\(\)/);
  assert.match(migration, /v_channel\.current_release_id <> p_release_id/);
  assert.match(migration, /where current_release_id = v_current/);
  assert.match(migration, /'0\.1\.0'/);
  assert.doesNotMatch(migration, /grant .* to anon/i);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
});

test("release client persists effective version for future feature gates", async () => {
  const client = await read("lib/app-release.ts");
  for (const rpc of [
    "get_my_app_release_state",
    "accept_app_release",
    "admin_list_app_releases",
    "admin_create_app_release",
    "admin_publish_app_release",
    "admin_rollback_app_release",
  ]) {
    assert.match(client, new RegExp(rpc));
  }
  assert.match(client, /APP_RELEASE_EFFECTIVE_KEY/);
  assert.match(client, /aasReleaseVersion/);
  assert.match(client, /aasReleaseBuild/);
  assert.match(client, /releaseVersionAtLeast/);
});

test("users only activate a waiting service worker after accepting an update", async () => {
  const [worker, manager] = await Promise.all([
    read("public/sw.js"),
    read("components/release-update-manager.tsx"),
  ]);

  const install = worker.match(/self\.addEventListener\("install",[\s\S]*?\n\}\);/);
  assert.ok(install);
  assert.doesNotMatch(install[0], /skipWaiting/);
  assert.match(worker, /AAS_ACTIVATE_RELEASE/);
  assert.match(worker, /self\.skipWaiting\(\)/);

  assert.match(manager, /acceptAppRelease/);
  assert.match(manager, /AAS_ACTIVATE_RELEASE/);
  assert.match(manager, /アップデートする/);
  assert.match(manager, /あとで/);
  assert.match(manager, /重要なアップデートがあります/);
  assert.match(manager, /is_admin_preview/);
});

test("admin release control provides candidate publish and rollback flows", async () => {
  const [page, sections, layout, css] = await Promise.all([
    read("components/admin-release-page.tsx"),
    read("lib/admin-sections.ts"),
    read("app/layout.tsx"),
    read("app/phase37-release-management.css"),
  ]);

  for (const label of [
    "管理者テスト版として登録",
    "アップデートを公開",
    "この版へ戻す",
    "任意アップデート",
    "必須アップデート",
  ]) {
    assert.match(page, new RegExp(label));
  }

  assert.match(page, /adminCreateAppRelease/);
  assert.match(page, /adminPublishAppRelease/);
  assert.match(page, /adminRollbackAppRelease/);
  assert.match(sections, /id: "releases"/);
  assert.match(sections, /href: "\/admin\/releases"/);
  assert.match(layout, /ReleaseUpdateManager/);
  assert.match(layout, /phase37-release-management\.css/);
  assert.match(css, /\.release-required-backdrop/);
  assert.match(css, /\.release-admin-page/);
});
