import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("commerce database extends existing entitlement security instead of bypassing it", async () => {
  const migration = await readRepo("supabase/migrations/20260914003000_commerce_billing_foundation.sql");

  for (const table of [
    "commerce_plans",
    "billing_customers",
    "billing_checkout_sessions",
    "billing_subscriptions",
    "billing_events",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }

  assert.match(migration, /AAS-PWA-7DAY/);
  assert.match(migration, /AAS-PWA-MONTHLY/);
  assert.match(migration, /AAS-WIN-MONTHLY/);
  assert.match(migration, /AAS-BUNDLE-MONTHLY/);
  assert.match(migration, /array\['AAS-PWA-BETA', 'AAS-WIN-BETA'\]/);
  assert.match(migration, /on conflict \(provider_event_id\) do nothing/);
  assert.match(migration, /billing_apply_pass_event/);
  assert.match(migration, /billing_sync_subscription_event/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.billing_[^(]+\([^;]+\) to authenticated/i);
});

test("billing Worker fails closed and validates raw Stripe webhook signatures", async () => {
  const worker = await read("worker/billing.ts");

  assert.match(worker, /AAS_COMMERCE_MODE/);
  assert.match(worker, /return value === "test" \|\| value === "live" \? value : "off"/);
  assert.match(worker, /request\.arrayBuffer\(\)/);
  assert.match(worker, /stripe-signature/);
  assert.match(worker, /HMAC/);
  assert.match(worker, /SHA-256/);
  assert.match(worker, /SIGNATURE_TOLERANCE_SECONDS = 300/);
  assert.match(worker, /billing_mode_mismatch/);
  assert.match(worker, /checkout\.session\.completed/);
  assert.match(worker, /customer\.subscription\.updated/);
  assert.match(worker, /invoice\.payment_failed/);
  assert.match(worker, /billing_record_ignored_event/);
  assert.doesNotMatch(worker, /console\.(log|info|debug)\([^)]*(secret|service|signature|authorization)/i);
});

test("service-role and Stripe secrets stay outside browser-visible configuration", async () => {
  const envExample = await read(".env.example");
  const client = await read("lib/commerce.ts");
  const plans = await read("components/commerce-plans-page.tsx");
  const billing = await read("components/billing-account-page.tsx");

  for (const source of [envExample, client, plans, billing]) {
    assert.doesNotMatch(source, /AAS_SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /AAS_STRIPE_SECRET_KEY/);
    assert.doesNotMatch(source, /AAS_STRIPE_WEBHOOK_SECRET/);
    assert.doesNotMatch(source, /^\s*NEXT_PUBLIC_[A-Z0-9_]+\s*=\s*(?:sb_secret_|sk_(?:live|test)_|whsec_)/im);
  }

  assert.match(client, /client\.auth\.getSession\(\)/);
  assert.match(client, /authorization: `Bearer \$\{token\}`/);
});

test("purchase UI states renewal and cancellation terms before Checkout", async () => {
  const plans = await read("components/commerce-plans-page.tsx");
  const disclosure = await read("components/commercial-transactions-page.tsx");
  const client = await read("lib/commerce.ts");

  assert.match(plans, /1か月ごとの自動更新/);
  assert.match(plans, /7日間・自動更新なし/);
  assert.match(plans, /特定商取引法に基づく表記/);
  assert.match(plans, /accepted/);
  assert.match(disclosure, /販売価格/);
  assert.match(disclosure, /支払時期/);
  assert.match(disclosure, /解約/);
  assert.match(disclosure, /返金・キャンセル/);
  assert.match(client, /Intl\.NumberFormat\("ja-JP"/);
});

test("Worker routes billing before the application handler", async () => {
  const entry = await read("worker/index.ts");
  assert.match(entry, /handleBillingRequest/);
  assert.match(entry, /if \(billingResponse\) return billingResponse/);
  assert.ok(entry.indexOf("handleBillingRequest") < entry.indexOf("return handler.fetch"));
});
