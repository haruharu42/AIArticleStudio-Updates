# AI Article Studio — Commerce / Subscription Production Checklist

This checklist intentionally keeps live sales disabled until every required gate is complete.

## 1. Product model

The application recognizes four commerce plans:

- `AAS-PWA-7DAY` — one-time 7-day PWA pass, no automatic renewal
- `AAS-PWA-MONTHLY` — monthly PWA subscription
- `AAS-WIN-MONTHLY` — monthly Windows subscription
- `AAS-BUNDLE-MONTHLY` — monthly PWA + Windows subscription

The existing entitlement products remain the runtime access-control source:

- `AAS-PWA-BETA`
- `AAS-WIN-BETA`

Stripe billing events update those existing entitlements; article, image, Auth and Storage access checks do not bypass the existing entitlement layer.

## 2. Stripe TEST mode first

Create one Stripe Product/Price per plan. Price amounts are not stored in source code; Stripe Price IDs are the source of truth.

Set Worker bindings/secrets for Preview only:

- `AAS_COMMERCE_MODE=test`
- `AAS_SUPABASE_URL`
- `AAS_SUPABASE_SERVICE_ROLE_KEY`
- `AAS_STRIPE_SECRET_KEY` using a test key
- `AAS_STRIPE_WEBHOOK_SECRET` using the test webhook endpoint secret
- `AAS_STRIPE_PRICE_PWA_7D`
- `AAS_STRIPE_PRICE_PWA_MONTHLY`
- `AAS_STRIPE_PRICE_WINDOWS_MONTHLY`
- `AAS_STRIPE_PRICE_BUNDLE_MONTHLY`

Never put a service-role key, Stripe secret key or webhook secret into `NEXT_PUBLIC_*`, `.env.example`, client code, GitHub source, screenshots or logs.

## 3. Stripe webhook

Register the Preview endpoint first:

`https://<preview-host>/api/billing/stripe-webhook`

Events handled by the Worker:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The Worker verifies the raw request body against `Stripe-Signature` before processing an event. Billing event storage keeps compact event identifiers/status only and does not persist the full webhook payload.

## 4. Customer Portal

Enable Stripe Customer Portal for subscription cancellation and payment-method management.

Initial release policy:

- cancellation should be scheduled for period end rather than immediate access removal
- do not enable arbitrary plan switching until every allowed transition has completed TEST-mode E2E
- if plan switching is later enabled, verify that the new Stripe Price ID maps to the intended AAS plan and entitlement set

## 5. Legal / seller information

Before setting `AAS_COMMERCE_MODE=live`, set all public seller fields:

- `AAS_SELLER_NAME`
- `AAS_SELLER_ADDRESS`
- `AAS_SELLER_PHONE`
- `AAS_SELLER_EMAIL`
- `AAS_SUPPORT_URL`

Review and finalize:

- 利用規約
- プライバシーポリシー
- AI利用条件
- 特定商取引法に基づく表記
- refund / cancellation policy
- supported environment
- support response policy

The application fails closed for live purchases when required seller fields are missing.

## 6. Required E2E scenarios

Run these with disposable test data before live sale:

1. New active user -> PWA 7-day pass -> payment success -> PWA entitlement active -> expiry present.
2. Purchase another 7-day pass -> finite expiry extends by seven days without shortening an existing valid period.
3. New active user -> PWA monthly -> subscription active -> PWA entitlement expires at or after current Stripe period end.
4. Cancel monthly at period end -> access remains through current period -> subscription cancellation event -> Stripe-owned entitlement ends afterward.
5. Payment failure / past due -> billing status is visible and entitlement follows the defined grace/current-period behavior.
6. PWA monthly cannot be duplicated while an overlapping active PWA subscription exists.
7. Bundle monthly grants both PWA and Windows entitlements.
8. Admin account remains purchase-free and retains administrative access behavior.
9. Suspended/disabled user cannot start a new checkout; an existing user can still reach contract management where appropriate.
10. Duplicate webhook delivery is idempotent by Stripe event ID.
11. Invalid webhook signature is rejected and does not alter entitlements.
12. TEST webhook is rejected in LIVE mode and LIVE webhook is rejected in TEST mode.
13. No secret/service-role value is present in browser bundles, source-visible configuration or client network responses.

After each disposable E2E, delete or expire test Stripe objects and confirm Supabase billing/entitlement records match the expected terminal state.

## 7. Release gates

Required before live sales:

- stacked PR integration order resolved
- typecheck SUCCESS
- lint SUCCESS
- build SUCCESS
- regression tests SUCCESS
- dependency audit/preflight SUCCESS
- guarded Preview deployment SUCCESS
- iPhone real-device purchase UI check
- Android real-device purchase UI check
- Stripe TEST-mode purchase / webhook / portal E2E SUCCESS
- seller/legal fields finalized
- refund/cancellation wording finalized
- Production route/domain release explicitly approved
- Stripe LIVE Products/Prices/Webhook created separately from TEST objects
- Production secrets set in Cloudflare without exposing values

Only after all gates pass should `AAS_COMMERCE_MODE=live` be configured for the Production Worker.
