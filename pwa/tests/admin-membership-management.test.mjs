import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readRepo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("membership admin route is registered in the grouped admin hub", () => {
  const registry = read("lib/admin-sections.ts");
  const route = read("app/admin/membership/page.tsx");
  const page = read("components/admin-membership-page.tsx");

  assert.match(registry, /id: "membership"/);
  assert.match(registry, /href: "\/admin\/membership"/);
  assert.match(registry, /メンバーシップ管理/);
  assert.match(route, /AdminMembershipPage/);
  assert.match(page, /noteメンバー特典の付与・取消、プラン別機能、参加URL/);
});

test("membership admin exposes note URL, feature matrix and user grant/revoke workflow", () => {
  const page = read("components/admin-membership-page.tsx");

  for (const label of [
    "noteメンバーシップ基本設定",
    "noteメンバーシップURL",
    "プランごとの利用可能機能",
    "ユーザーへメンバー特典を付与",
    "メンバー特典を取り消す",
    "期限切れ予定",
    "クラウド容量",
    "加入確認履歴",
  ]) {
    assert.match(page, new RegExp(label));
  }

  assert.match(page, /setCreatorMembershipPlan/);
  assert.match(page, /clearCreatorMembershipPlan/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /note-membership-admin/);
  assert.match(page, /AAS ID または表示名/);
  assert.match(page, /https:\/\/note\.com\//);
  assert.doesNotMatch(page, /service[_-]?role|sb_secret_/i);
});

test("membership feature management is server gated and ready for cloud image storage", () => {
  const migration = readRepo("supabase/migrations/20260923072000_membership_management_center.sql");
  const adminClient = read("lib/admin-membership.ts");
  const accessClient = read("lib/membership-access.ts");

  for (const feature of [
    "cloud_image_storage",
    "cross_device_image_sync",
    "fresh_knowledge",
    "priority_templates",
    "member_missions",
    "plus_missions",
    "pro_missions",
    "article_quota_bonus",
  ]) {
    assert.match(migration, new RegExp(feature));
  }

  assert.match(migration, /private\.is_active_admin\(\)/);
  assert.match(migration, /has_creator_membership_feature/);
  assert.match(migration, /get_creator_membership_public_settings/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.creator_membership_settings from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.creator_membership_features from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.creator_membership_plan_features from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.has_creator_membership_feature\(text\) to authenticated/);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_/i);

  assert.match(adminClient, /admin_get_creator_membership_settings/);
  assert.match(adminClient, /admin_update_creator_membership_settings/);
  assert.match(adminClient, /admin_set_creator_membership_plan_feature/);
  assert.match(accessClient, /get_creator_membership_public_settings/);
  assert.match(accessClient, /has_creator_membership_feature/);
});

test("membership defaults make cloud image storage a member-only capability across active plans", () => {
  const migration = readRepo("supabase/migrations/20260923072000_membership_management_center.sql");

  assert.match(migration, /'CREATOR_CLUB', 'cloud_image_storage', true/);
  assert.match(migration, /'CREATOR_CLUB_PLUS', 'cloud_image_storage', true/);
  assert.match(migration, /'CREATOR_CLUB_PRO', 'cloud_image_storage', true/);
  assert.match(migration, /'CREATOR_CLUB', 'plus_missions', false/);
  assert.match(migration, /'CREATOR_CLUB_PLUS', 'plus_missions', true/);
  assert.match(migration, /'CREATOR_CLUB_PRO', 'pro_missions', true/);
});
