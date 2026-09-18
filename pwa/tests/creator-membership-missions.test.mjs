import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const readPwa = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("reference home owns creator presentation without duplicating global banners", async () => {
  const homeRoute = await readPwa("app/page.tsx");
  const home = await readPwa("components/phase18-beginner-home.tsx");
  const shell = await readPwa("components/aas-reference-shell.tsx");

  assert.doesNotMatch(homeRoute, /CreatorHud/);
  assert.doesNotMatch(homeRoute, /FreeTrialBanner/);
  assert.match(home, /getMyCreatorDashboard/);
  assert.match(home, /今日のミッション/);
  assert.match(home, /記事ライブラリ \/ noteマガジン/);
  assert.match(shell, /ホーム/);
  assert.match(shell, /ランキング/);
  assert.match(shell, /プロフィール/);
  assert.match(shell, /hasUnreadNotifications/);
});

test("creator client uses v2 dashboard with a legacy compatibility fallback", async () => {
  const source = await readPwa("lib/creator-system.ts");
  assert.match(source, /client\.rpc\("get_my_creator_dashboard_v2"\)/);
  assert.match(source, /client\.rpc\("get_my_creator_dashboard"\)/);
  assert.match(source, /getMyCreatorMissions/);
  assert.match(source, /claimCreatorMissionReward/);
  assert.match(source, /listCreatorMembershipPlans/);
});

test("creator pages keep membership, missions and ranking separate and beginner-readable", async () => {
  const missions = await readPwa("app/missions/page.tsx");
  const membership = await readPwa("app/membership/page.tsx");
  const ranking = await readPwa("app/ranking/page.tsx");

  assert.match(missions, /getMyCreatorMissions/);
  assert.match(missions, /claimCreatorMissionReward/);
  assert.match(missions, /記事制作を進めるだけで達成できます/);
  assert.match(missions, /creator-quests\.module\.css/);

  assert.match(membership, /listCreatorMembershipPlans/);
  assert.match(membership, /AASに登録されたnoteメンバーシッププラン/);
  assert.match(membership, /note購入状態の自動取得は別の連携機能/);
  assert.match(membership, /creator-quests\.module\.css/);

  assert.match(ranking, /getCreatorRanking/);
  assert.match(ranking, /完成記事数/);
  assert.match(ranking, /最初に条件を満たした時だけ集計/);
  assert.match(ranking, /referenceRankTabs/);
  assert.match(ranking, /queueMicrotask/);
  assert.match(ranking, /requestIdRef/);
  assert.match(ranking, /requestId !== requestIdRef\.current/);
});

test("membership migration is additive, tier-aware and preserves article RPC names", async () => {
  const migration = await readRepo("supabase/migrations/20260917202000_creator_membership_plans_missions_quota.sql");
  const flexibility = await readRepo("supabase/migrations/20260917202100_creator_membership_plan_tier_flexibility.sql");

  assert.match(migration, /AAS-NOTE-CREATOR-CLUB-PLUS/);
  assert.match(migration, /AAS-NOTE-CREATOR-CLUB-PRO/);
  assert.match(migration, /create table if not exists public\.creator_membership_plans/);
  assert.match(migration, /create table if not exists public\.creator_mission_definitions/);
  assert.match(migration, /private\.creator_article_quota_bonus/);
  assert.match(migration, /create or replace function public\.create_article\(p_article jsonb default '\{\}'::jsonb\)/i);
  assert.match(migration, /create or replace function public\.get_my_article_stock_summary\(\)/);
  assert.match(migration, /article_quota_bonus_every_levels integer not null default 5/);
  assert.match(migration, /article_quota_bonus_per_step integer not null default 10/);
  assert.match(flexibility, /drop index if exists public\.creator_membership_plans_active_tier_idx/);
  assert.match(flexibility, /creator_membership_plans_tier_lookup_idx/);

  assert.doesNotMatch(migration, /latest\.json/i);
  assert.doesNotMatch(migration, /Update\.ps1/i);
  assert.doesNotMatch(migration, /windows\/|app\/auth_ui\.py/i);
});

test("mission completion remains tied to first valid completed article", async () => {
  const migration = await readRepo("supabase/migrations/20260917202000_creator_membership_plans_missions_quota.sql");
  assert.match(migration, /creator_article_completions/);
  assert.match(migration, /on conflict \(article_id\) do nothing/i);
  assert.match(migration, /new\.status not in \('ready', 'waiting_publish', 'published'\)/);
  assert.match(migration, /body_chars < min_body_chars/);
  assert.match(migration, /progress_creator_missions\(new\.user_id, 'article_completed', 1\)/);
});

test("generation credits are stored as rewards without changing the existing usage limiter in this feature", async () => {
  const migration = await readRepo("supabase/migrations/20260917202000_creator_membership_plans_missions_quota.sql");
  const freeTrial = await readPwa("lib/free-trial.ts");

  assert.match(migration, /bonus_generation_credits/);
  assert.match(migration, /reward_generation_credits/);
  assert.doesNotMatch(migration, /create or replace function public\.consume_free_trial_usage/i);
  assert.match(freeTrial, /consume_free_trial_usage/);
});

test("admin can atomically register one verified Creator Club plan without touching PWA access", async () => {
  const migration = await readRepo("supabase/migrations/20260917202200_creator_membership_admin_management.sql");
  const client = await readPwa("lib/pwa-admin-users.ts");
  const controller = await readPwa("components/pwa-admin-users-page.tsx");
  const panels = await readPwa("components/admin-users/admin-user-panels.tsx");
  const activeAdminUi = `${controller}\n${panels}`;

  assert.match(migration, /admin_set_creator_membership_plan/);
  assert.match(migration, /admin_clear_creator_membership_plan/);
  assert.match(migration, /set status = 'revoked'/);
  assert.match(migration, /creator_membership_plans/);
  assert.doesNotMatch(migration, /AAS-PWA-BETA/);

  assert.match(client, /CREATOR_MEMBERSHIP_PLANS/);
  assert.match(client, /admin_set_creator_membership_plan/);
  assert.match(client, /admin_clear_creator_membership_plan/);
  assert.match(activeAdminUi, /note購入状態の自動取得は行わず/);
  assert.match(activeAdminUi, /Creator Clubを登録・変更/);
  assert.match(activeAdminUi, /Creator Clubを解除/);
  assert.doesNotMatch(activeAdminUi, /AAS-WIN-BETA|Windowsアプリ版/);
});

test("admin access panels show only currently usable PWA and Creator Club entitlements", async () => {
  const client = await readPwa("lib/pwa-admin-users.ts");

  assert.match(client, /function isCurrentEntitlement/);
  assert.match(client, /item\.status !== "active"/);
  assert.match(client, /expiresAt > Date\.now\(\)/);
  assert.match(client, /item\.productCode === PWA_PRODUCT && isCurrentEntitlement\(item\)/);
  assert.match(client, /CREATOR_MEMBERSHIP_PRODUCTS\.has\(item\.productCode\) && isCurrentEntitlement\(item\)/);
});
