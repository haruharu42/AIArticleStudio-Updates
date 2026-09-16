import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  process.cwd(),
  "..",
  "supabase",
  "migrations",
  "20260916024000_user_data_isolation_hardening.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

const forcedRlsTables = [
  "profiles",
  "articles",
  "article_workspaces",
  "article_assets",
  "user_entitlements",
  "user_writing_profiles",
  "billing_checkout_sessions",
  "billing_subscriptions",
  "billing_customers",
  "billing_events",
  "pwa_invites",
  "pwa_invite_redemptions",
  "user_free_trials",
  "free_trial_daily_usage",
  "admin_user_actions",
  "commerce_sales_settings",
  "knowledge_candidate_signals",
  "knowledge_candidate_decisions",
  "ops_audit_runs",
  "ops_audit_findings",
  "ops_events",
  "ops_health_checks",
  "ops_capacity_settings",
];

const readOnlyClientTables = [
  "profiles",
  "articles",
  "article_workspaces",
  "article_assets",
  "user_entitlements",
  "billing_checkout_sessions",
  "billing_subscriptions",
];

test("sensitive and user-owned tables keep RLS forced", () => {
  for (const table of forcedRlsTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security;`, "i"));
  }
});

test("anonymous access is revoked from all user and sensitive tables", () => {
  assert.match(sql, /revoke all on table[\s\S]+from anon;/i);
  for (const table of forcedRlsTables) {
    assert.match(sql, new RegExp(`public\\.${table}`, "i"));
  }
});

test("signed-in direct access remains least-privilege", () => {
  for (const table of readOnlyClientTables) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table} from authenticated;[\\s\\S]{0,120}grant select on table public\\.${table} to authenticated;`,
        "i",
      ),
    );
  }

  assert.match(
    sql,
    /revoke all on table public\.user_writing_profiles from authenticated;[\s\S]{0,160}grant select, insert, update, delete on table public\.user_writing_profiles to authenticated;/i,
  );

  assert.doesNotMatch(sql, /grant\s+all\s+on\s+table[\s\S]*\b(?:anon|authenticated)\b/i);
});

test("article Storage requires both owner path and prepared metadata", () => {
  for (const policy of [
    "article_assets_storage_insert_prepared",
    "article_assets_storage_select_ready",
    "article_assets_storage_select_delete_pending",
    "article_assets_storage_delete_pending",
  ]) {
    assert.match(sql, new RegExp(`create policy ${policy}`, "i"));
  }

  assert.match(sql, /split_part\(name, '\/', 1\) = \(select auth\.uid\(\)\)::text/i);
  assert.match(sql, /asset\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /asset\.storage_path = storage\.objects\.name/i);
  assert.match(sql, /asset\.storage_bucket = storage\.objects\.bucket_id/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*for update[\s\S]*article-assets/i);
  assert.doesNotMatch(sql, /(?:using|with check)\s*\(\s*true\s*\)/i);
});
