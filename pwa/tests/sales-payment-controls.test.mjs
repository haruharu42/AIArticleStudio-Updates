import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const readPwa = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("sales settings default to external/code on and Stripe sales off", async () => {
  const migration = await readRepo("supabase/migrations/20260915074000_commerce_sales_controls.sql");

  assert.match(migration, /external_sales_enabled boolean not null default true/i);
  assert.match(migration, /access_code_enabled boolean not null default true/i);
  assert.match(migration, /stripe_checkout_enabled boolean not null default false/i);
  assert.match(migration, /pwa_7day_enabled boolean not null default false/i);
  assert.match(migration, /pwa_monthly_enabled boolean not null default false/i);
  assert.match(migration, /windows_monthly_enabled boolean not null default false/i);
  assert.match(migration, /bundle_monthly_enabled boolean not null default false/i);
});

test("sales settings are active-admin controlled and do not destructively revoke existing rights", async () => {
  const migration = await readRepo("supabase/migrations/20260915074000_commerce_sales_controls.sql");

  assert.match(migration, /admin_get_commerce_sales_settings/);
  assert.match(migration, /admin_update_commerce_sales_settings/);
  assert.match(migration, /private\.is_active_admin\(\)/);
  assert.match(migration, /access_code_enabled/);
  assert.match(migration, /access code redemption is disabled/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.user_entitlements/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.billing_subscriptions/i);
  assert.doesNotMatch(migration, /update\s+public\.billing_subscriptions\s+set\s+status/i);
});

test("Stripe Checkout is gated server-side and billing portal remains available", async () => {
  const [salesWorker, index, billing] = await Promise.all([
    readPwa("worker/sales-controls.ts"),
    readPwa("worker/index.ts"),
    readPwa("worker/billing.ts"),
  ]);

  assert.match(salesWorker, /\/api\/billing\/checkout/);
  assert.match(salesWorker, /stripeCheckoutEnabled/);
  assert.match(salesWorker, /PLAN_FLAGS/);
  assert.match(salesWorker, /販売受付設定を確認できないため、新規決済を停止しています/);
  assert.match(salesWorker, /Stripeでの新規購入受付は停止しています/);
  assert.doesNotMatch(salesWorker, /\/api\/billing\/portal/);
  assert.ok(index.indexOf("handleSalesControlRequest") < index.indexOf("handleBillingRequest(request, env)"));
  assert.match(billing, /\/api\/billing\/portal/);
});

test("admin UI exposes all requested sales switches", async () => {
  const [adminSections, settingsPage, settingsLib, layout] = await Promise.all([
    readPwa("lib/admin-sections.ts"),
    readPwa("components/sales-settings-admin-page.tsx"),
    readPwa("lib/sales-settings.ts"),
    readPwa("app/layout.tsx"),
  ]);

  assert.match(adminSections, /href: "\/admin\/sales"/);
  for (const label of [
    "note / Brain / Tips等の外部販売",
    "利用コード受付",
    "Stripe新規購入受付",
    "PWA 7日利用パス",
    "PWA 月額プラン",
    "Windows 月額プラン",
    "PWA + Windows 月額",
  ]) assert.ok(settingsPage.includes(label), `missing admin setting: ${label}`);
  assert.match(settingsPage, /既存の月額契約・利用期間・利用権は停止・取消しされません/);
  assert.match(settingsLib, /admin_get_commerce_sales_settings/);
  assert.match(settingsLib, /admin_update_commerce_sales_settings/);
  assert.match(layout, /phase32-sales-settings\.css/);
});

test("plans and access-code UI obey public sales settings", async () => {
  const [plans, settingsLib] = await Promise.all([
    readPwa("components/commerce-plans-page.tsx"),
    readPwa("lib/sales-settings.ts"),
  ]);

  assert.match(plans, /fetchPublicSalesSettings/);
  assert.match(plans, /planSalesEnabled\(salesSettings, plan\.planCode\)/);
  assert.match(plans, /salesSettings\?\.accessCodeEnabled/);
  assert.match(plans, /利用コードをお持ちの方/);
  assert.match(plans, /Stripe新規受付停止中/);
  assert.match(settingsLib, /if \(!settings\?\.stripeCheckoutEnabled\) return false/);
  for (const planCode of ["AAS-PWA-7DAY", "AAS-PWA-MONTHLY", "AAS-WIN-MONTHLY", "AAS-BUNDLE-MONTHLY"]) {
    assert.ok(settingsLib.includes(planCode), `missing plan gate: ${planCode}`);
  }
});

test("commercial transaction copy follows the active sales mode", async () => {
  const page = await readPwa("components/commercial-transactions-page.tsx");

  assert.match(page, /fetchPublicSalesSettings/);
  assert.match(page, /planSalesEnabled/);
  assert.match(page, /stripeSalesEnabled/);
  assert.match(page, /externalSalesEnabled/);
  assert.match(page, /AAS内のStripe新規購入は停止しています/);
  assert.match(page, /外部販売ページで案内する支払方法/);
  assert.match(page, /案内された利用コードをAASへ登録/);
  assert.match(page, /visibleStripePlans/);
});
