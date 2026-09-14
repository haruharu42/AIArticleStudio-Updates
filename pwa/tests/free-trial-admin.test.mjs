import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("free trial is once per account and server-side with forced RLS", async () => {
  const migration = await readRepo("supabase/migrations/20260914021000_free_trial_admin_controls.sql");

  for (const table of ["free_trial_settings", "user_free_trials", "free_trial_daily_usage"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }

  assert.match(migration, /user_id uuid primary key references public\.profiles/);
  assert.match(migration, /primary key \(user_id, usage_date, feature\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /trial already exists/);
  assert.match(migration, /requested_product_code = 'AAS-PWA-BETA'/);
  assert.doesNotMatch(migration, /requested_product_code = 'AAS-WIN-BETA'\s+and exists \(\s*select 1\s+from public\.free_trial/i);
});

test("all free trial limits and lifecycle settings are administrator configurable", async () => {
  const migration = await readRepo("supabase/migrations/20260914021000_free_trial_admin_controls.sql");
  const admin = await read("components/free-trial-admin-panel.tsx");
  const adminPage = await read("components/free-trial-admin-page.tsx");

  for (const setting of [
    "duration_days",
    "daily_total_limit",
    "article_generate_limit",
    "title_generate_limit",
    "article_rewrite_limit",
    "sns_generate_limit",
    "image_generate_limit",
    "ai_assist_limit",
    "reset_timezone",
    "reset_hour",
    "auto_start_on_activation",
    "new_users_only",
    "eligible_from",
    "apply_duration_changes_to_active",
  ]) {
    assert.match(migration, new RegExp(setting));
  }

  assert.match(migration, /admin_get_free_trial_settings/);
  assert.match(migration, /admin_update_free_trial_settings/);
  assert.match(migration, /admin_get_user_free_trial/);
  assert.match(migration, /admin_start_user_free_trial/);
  assert.match(migration, /admin_update_user_free_trial/);
  assert.match(migration, /admin_reset_user_free_trial_usage/);
  assert.match(migration, /private\.is_active_admin\(\)/);

  assert.match(admin, /無料期間（日）/);
  assert.match(admin, /1日の総利用回数/);
  assert.match(admin, /記事生成 \/ 日/);
  assert.match(admin, /SNS投稿生成 \/ 日/);
  assert.match(admin, /画像生成 \/ 日/);
  assert.match(admin, /リセットタイムゾーン/);
  assert.match(admin, /active承認時に自動開始/);
  assert.match(admin, /本日の回数をリセット/);
  assert.match(adminPage, /AAS ID・表示名で検索/);
});

test("eligible active users start trial before PWA access check", async () => {
  const access = await read("lib/phase6-access.ts");
  assert.match(access, /ensureMyFreeTrial\(client\)/);
  assert.ok(access.indexOf("ensureMyFreeTrial(client)") < access.indexOf('client.rpc(\n    "can_access_product"'));
});

test("trial action gates consume server-side limits for current AAS creation features", async () => {
  const gate = await read("components/free-trial-feature-gate.tsx");
  const createPage = await read("app/create/page.tsx");
  const imagePage = await read("app/images/page.tsx");
  const snsPage = await read("app/sns/page.tsx");

  assert.match(gate, /consumeFreeTrialUsage/);
  assert.match(gate, /1回使用して/);
  assert.match(createPage, /feature="article_generate"/);
  assert.match(imagePage, /feature="image_generate"/);
  assert.match(snsPage, /feature="sns_generate"/);
});

test("paid users and admins bypass trial limits without browser secrets", async () => {
  const migration = await readRepo("supabase/migrations/20260914021000_free_trial_admin_controls.sql");
  const client = await read("lib/free-trial.ts");
  const gate = await read("components/free-trial-feature-gate.tsx");

  assert.match(migration, /profile_role = 'admin'/);
  assert.match(migration, /has_active_product_entitlement\(current_user_id, 'AAS-PWA-BETA'\)/);
  assert.match(gate, /next\.bypassLimits/);
  assert.doesNotMatch(client, /SERVICE_ROLE|AAS_SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET/i);
});

test("home displays trial remaining days and daily usage", async () => {
  const page = await read("app/page.tsx");
  const banner = await read("components/free-trial-banner.tsx");
  assert.match(page, /FreeTrialBanner/);
  assert.match(banner, /残り \{status\.remainingDays/);
  assert.match(banner, /status\.totalUsed/);
  assert.match(banner, /status\.dailyTotalLimit/);
  assert.doesNotMatch(banner, /7日無料トライアル/);
});
