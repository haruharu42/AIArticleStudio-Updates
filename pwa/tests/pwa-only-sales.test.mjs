import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("new sales are restricted to PWA while legacy billing recognition stays intact", async () => {
  const entry = await read("worker/index.ts");
  const billing = await read("worker/billing.ts");
  const salesWorker = await read("worker/sales-controls.ts");
  const sales = await read("lib/sales-settings.ts");
  const admin = await read("components/sales-settings-admin-page.tsx");

  assert.match(entry, /PWA_NEW_SALE_PLAN_CODES/);
  assert.match(entry, /"AAS-PWA-7DAY"/);
  assert.match(entry, /"AAS-PWA-MONTHLY"/);
  assert.match(entry, /rejectLegacyCheckout/);
  assert.match(entry, /\/api\/billing\/checkout/);
  assert.match(entry, /現在はPWAプランのみ購入できます/);
  assert.match(entry, /filterPublicBillingConfig/);
  assert.match(entry, /\/api\/billing\/config/);
  assert.match(entry, /commerceReady/);

  // PWA runtime models no longer carry dead Windows/Bundle sale flags.
  assert.doesNotMatch(sales, /windowsMonthlyEnabled/);
  assert.doesNotMatch(sales, /bundleMonthlyEnabled/);
  assert.doesNotMatch(salesWorker, /windowsMonthlyEnabled/);
  assert.doesNotMatch(salesWorker, /bundleMonthlyEnabled/);
  assert.doesNotMatch(salesWorker, /windows_monthly_enabled/);
  assert.doesNotMatch(salesWorker, /bundle_monthly_enabled/);
  assert.doesNotMatch(salesWorker, /AAS-WIN-MONTHLY/);
  assert.doesNotMatch(salesWorker, /AAS-BUNDLE-MONTHLY/);

  // The database RPC still accepts the legacy arguments, so keep them fail-closed.
  assert.match(sales, /p_windows_monthly_enabled: false/);
  assert.match(sales, /p_bundle_monthly_enabled: false/);
  assert.match(sales, /if \(planCode === "AAS-PWA-7DAY"\)/);
  assert.match(sales, /if \(planCode === "AAS-PWA-MONTHLY"\)/);

  assert.match(admin, /PWA 7日利用パス/);
  assert.match(admin, /PWA 月額プラン/);
  assert.doesNotMatch(admin, /title="Windows 月額プラン"/);
  assert.doesNotMatch(admin, /title="PWA \+ Windows 月額"/);

  // Historical plans remain recognizable so old subscription/webhook records can still reconcile.
  assert.match(billing, /AAS-WIN-MONTHLY/);
  assert.match(billing, /AAS-BUNDLE-MONTHLY/);
  assert.match(billing, /planForPrice/);
  assert.match(billing, /customer\.subscription\.updated/);
});
