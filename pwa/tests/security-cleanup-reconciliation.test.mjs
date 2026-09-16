import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("retains the applied user-data isolation audit migration in repository history", async () => {
  const sql = await readRepo("supabase/migrations/20260916023000_user_data_isolation_hardening.sql");
  assert.match(sql, /for all to anon, authenticated using \(false\) with check \(false\)/);
  assert.match(sql, /private\.ops_run_user_data_isolation_audit/);
  assert.match(sql, /aas-user-data-isolation-audit-hourly/);
  assert.match(sql, /ADMIN_RPC_AUTHORIZATION_MISSING/);
  assert.match(sql, /USER_DATA_STORAGE_POLICY_WEAK/);
});

test("article Storage requires both owned metadata and an auth.uid path prefix", async () => {
  const sql = await readRepo("supabase/migrations/20260916140407_article_storage_owner_path_hardening.sql");
  for (const policy of [
    "article_assets_storage_insert_prepared",
    "article_assets_storage_select_ready",
    "article_assets_storage_select_delete_pending",
    "article_assets_storage_delete_pending",
  ]) {
    assert.match(sql, new RegExp(policy));
  }
  assert.match(sql, /split_part\(name, '\/', 1\) = \(select auth\.uid\(\)\)::text/);
  assert.match(sql, /asset\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /asset\.storage_path = storage\.objects\.name/);
  assert.match(sql, /AAS-WIN-BETA/);
  assert.match(sql, /AAS-PWA-BETA/);
  assert.doesNotMatch(sql, /for update/i);
});
