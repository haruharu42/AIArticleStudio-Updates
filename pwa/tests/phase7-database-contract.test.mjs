import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pwaRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationPath = path.join(
  pwaRoot,
  "..",
  "supabase",
  "migrations",
  "20260905133313_phase7_cloud_article_entitlement_enforcement.sql",
);
const migration = await readFile(migrationPath, "utf8");

test("enforces Windows-or-PWA entitlement at every shared-data boundary", () => {
  assert.match(migration, /private\.require_cloud_article_entitlement\(\)/);
  assert.match(migration, /public\.can_access_product\('AAS-WIN-BETA'\)/g);
  assert.match(migration, /public\.can_access_product\('AAS-PWA-BETA'\)/g);

  for (const trigger of [
    "articles_require_cloud_entitlement",
    "article_workspaces_require_cloud_entitlement",
    "article_assets_require_cloud_entitlement",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`));
  }

  for (const policy of [
    "articles_select_own_active",
    "article_workspaces_select_own_active",
    "article_assets_select_own_active",
    "article_assets_storage_insert_prepared",
    "article_assets_storage_select_ready",
    "article_assets_storage_select_delete_pending",
    "article_assets_storage_delete_pending",
  ]) {
    assert.match(migration, new RegExp(`create policy ${policy}`));
  }
});

test("keeps owner isolation and protects SECURITY DEFINER functions", () => {
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/g);
  assert.match(migration, /set search_path = ''/g);
  assert.match(
    migration,
    /revoke all on function private\.require_cloud_article_entitlement\(\)\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(migration, /create or replace function public\.get_article_workspace/);
  assert.match(migration, /create or replace function public\.get_my_article_stock_summary/);
  assert.match(migration, /session_user in \('postgres', 'supabase_admin'\)/);
  assert.match(migration, /auth\.role\(\)\) = 'service_role'/);
});

test("contains deployment-time validation and no browser secrets", () => {
  assert.match(migration, /protected_trigger_count <> 3/);
  assert.match(migration, /protected_policy_count <> 7/);
  assert.doesNotMatch(migration, /sb_secret_/);
  assert.doesNotMatch(migration, /service_role\s*[:=]\s*["']/i);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});
