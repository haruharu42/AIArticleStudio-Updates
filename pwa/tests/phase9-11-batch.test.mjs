import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

const migrationPath = "supabase/migrations/20260910112000_phase9_pwa_invites_admin.sql";

test("Phase 9 migration keeps invite codes behind authenticated RPC boundaries", async () => {
  const sql = await readRepo(migrationPath);
  assert.match(sql, /create table public\.pwa_invites/);
  assert.match(sql, /create table public\.pwa_invite_redemptions/);
  assert.match(sql, /create or replace function public\.redeem_pwa_invite/);
  assert.match(sql, /create or replace function public\.admin_create_pwa_invite/);
  assert.match(sql, /create or replace function public\.admin_list_pwa_invites/);
  assert.match(sql, /create or replace function public\.admin_revoke_pwa_invite/);
  assert.match(sql, /create or replace function public\.admin_list_user_entitlements/);
  assert.match(sql, /security definer/g);
  assert.match(sql, /set search_path = ''/g);
  assert.match(sql, /revoke all on table public\.pwa_invites from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.pwa_invite_redemptions from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.redeem_pwa_invite\(text\)\s*to authenticated/);
  assert.match(sql, /product\.product_code = 'AAS-PWA-BETA'/);
  assert.match(sql, /current_role <> 'user'/);
  assert.match(sql, /current_status not in \('pending', 'active'\)/);
  assert.match(sql, /selected_invite\.entitlement_expires_at <= now\(\)/);
  assert.doesNotMatch(sql, /service[_-]?role/i);
});

test("Phase 9 invite route redeems entitlement without requiring existing PWA access", async () => {
  const api = await read("lib/phase9-invite.ts");
  const page = await read("components/phase9-invite-page.tsx");
  const route = await read("app/invite/page.tsx");
  assert.match(api, /"redeem_pwa_invite"/);
  assert.match(api, /p_invite_code/);
  assert.match(page, /status !== "pending" && data\.status !== "active"/);
  assert.match(page, /redeemPwaInvite/);
  assert.doesNotMatch(page, /can_access_product/);
  assert.match(route, /Phase9InvitePage/);
});

test("Phase 10 admin surface uses existing account and entitlement RPCs plus invite RPCs", async () => {
  const api = await read("lib/phase10-admin.ts");
  const page = await read("components/phase10-admin-page.tsx");
  const route = await read("app/admin/page.tsx");
  for (const rpc of ["admin_list_users", "admin_set_user_status", "admin_list_user_entitlements", "admin_grant_entitlement", "admin_revoke_entitlement", "admin_create_pwa_invite", "admin_list_pwa_invites", "admin_revoke_pwa_invite"]) {
    assert.match(api, new RegExp(`\\"${rpc}\\"`));
  }
  assert.match(api, /AAS-WIN-BETA/);
  assert.match(api, /AAS-PWA-BETA/);
  assert.match(page, /data\.role !== "admin" \|\| data\.status !== "active"/);
  assert.match(page, /Windows付与/);
  assert.match(page, /PWA付与/);
  assert.match(page, /招待コードを作成/);
  assert.match(route, /Phase10AdminPage/);
  assert.doesNotMatch(`${api}\n${page}`, /sb_secret_|service[_-]?role/i);
});

test("Phase 11 article creator saves an atomic article/workspace and restores guided dropdowns", async () => {
  const api = await read("lib/phase11-create.ts");
  const page = await read("components/phase11-create-page.tsx");
  const progress = await read("lib/phase11-wizard-progress.ts");
  const route = await read("app/create/page.tsx");
  const options = await read("lib/phase18-content-options.ts");

  assert.match(api, /"create_article_with_workspace"/);
  assert.match(api, /"can_access_product"/);
  assert.match(api, /PWA_PRODUCT_CODE/);
  assert.match(api, /request_json/);
  assert.match(api, /workspace_json/);
  assert.match(api, /image_plan_json/);
  assert.match(api, /source_body/);
  assert.match(api, /publish_body/);
  assert.match(api, /wizard_version: 11/);
  assert.match(api, /article_quota_exceeded/);
  assert.match(api, /ユーザーが入力していない実体験・実績・レビュー/);
  assert.match(api, /競合記事の文章をコピー・近似模倣しない/);
  assert.match(api, /Markdown見出し/);
  assert.match(api, /<!-- IMAGE:01 -->/);
  assert.doesNotMatch(api, /service[_-]?role|sb_secret_/i);

  for (const label of ["生成方法", "画像計画", "本文条件", "タイトル", "本文生成", "プレビュー", "保存"]) assert.match(page, new RegExp(label));
  assert.match(page, /prompt_export/);
  assert.match(page, /createArticleFromWizard/);
  assert.match(page, /GENRE_OPTIONS/);
  assert.match(page, /subgenreOptionsFor/);
  assert.match(page, /AGE_GROUP_OPTIONS/);
  assert.match(page, /GENDER_OPTIONS/);
  assert.match(page, /TARGET_LENGTH_OPTIONS/);
  assert.match(page, /launchAiApp/);
  assert.match(page, /key: "chatgpt", label: "ChatGPT"/);
  assert.match(page, /key: "claude", label: "Claude"/);
  assert.match(page, /key: "gemini", label: "Gemini"/);
  assert.match(page, /launchAiApp\(app\.key\)/);
  assert.doesNotMatch(page, /OPENAI_LINKS\.chatgpt/);
  assert.match(page, /initialDraftFromLocation/);
  assert.match(page, /home-quick-setup/);
  assert.match(page, /loadArticleWizardProgress/);
  assert.match(page, /saveArticleWizardProgress/);
  assert.match(page, /clearArticleWizardProgress/);
  assert.match(page, /setStep\(saved\.step\)/);
  assert.match(page, /前回の作業内容を復元しました/);
  assert.match(progress, /aas:pwa:article-wizard-progress:v1:/);
  assert.match(progress, /window\.localStorage/);
  assert.match(progress, /STORAGE_VERSION = 1/);
  assert.match(progress, /updatedAt/);
  assert.doesNotMatch(progress, /service[_-]?role|sb_secret_/i);
  assert.match(options, /AI副業/);
  assert.match(options, /生活・暮らし/);
  assert.match(route, /Phase11CreatePage/);
});

test("root uses the approved beginner dashboard across mobile and desktop", async () => {
  const rootPage = await read("app/page.tsx");
  const beginnerHome = await read("components/phase18-beginner-home.tsx");
  const layout = await read("app/layout.tsx");
  const css = await read("app/phase18-beginner.css");
  const dashboardCss = await read("app/phase19-dashboard.css");
  const deviceCss = await read("app/phase20-device-e2e.css");

  assert.match(rootPage, /Phase18BeginnerHome/);
  assert.doesNotMatch(rootPage, /Phase9To11QuickNav/);
  assert.match(beginnerHome, /Phase7App/);
  assert.match(beginnerHome, /記事作成/);
  assert.match(beginnerHome, /記事ライブラリ/);
  assert.match(beginnerHome, /画像作成/);
  assert.match(beginnerHome, /SNS投稿/);
  assert.match(beginnerHome, /AI_APP_LINKS/);
  assert.match(beginnerHome, /quickCreateHref/);
  assert.match(beginnerHome, /listCloudArticles/);
  assert.match(beginnerHome, />SNS<\/button>/);
  assert.doesNotMatch(beginnerHome, />画像<\/button>/);
  assert.match(layout, /phase18-beginner\.css/);
  assert.match(layout, /phase19-dashboard\.css/);
  assert.match(layout, /phase20-device-e2e\.css/);
  assert.match(layout, /openai-links\.css/);
  assert.match(layout, /"aas-phase": "17"/);
  assert.match(layout, /"aas-release-stage": "production-preview"/);
  assert.doesNotMatch(layout, /phase8-local/);
  assert.match(css, /\.beginner-shell/);
  assert.match(css, /\.beginner-bottom-nav/);
  assert.match(dashboardCss, /\.beginner-dashboard-frame/);
  assert.match(dashboardCss, /grid-template-columns: 210px minmax\(0, 1fr\) 300px/);
  assert.match(dashboardCss, /repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(deviceCss, /\.beginner-library-main \.library-page/);
  assert.match(deviceCss, /background: #f7faff/);
  assert.match(deviceCss, /\.beginner-creator-page \.wizard-steps/);
  assert.match(deviceCss, /repeat\(7, minmax\(0, 1fr\)\)/);
});

test("package runs the Phase 9-11 contract test without changing dependency versions", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.match(packageJson.scripts.test, /phase9-11-batch\.test\.mjs/);
  assert.match(packageJson.scripts.test, /openai-links\.test\.mjs/);
  assert.equal(packageJson.dependencies.next, "16.3.4");
  assert.equal(packageJson.dependencies.react, "19.2.8");
  assert.equal(packageJson.devDependencies.vinext, "1.0.0-beta.9");
});
