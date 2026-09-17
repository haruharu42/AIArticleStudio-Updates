# Commerce / Subscription implementation status

Date: 2026-09-14
Branch: `feature/commerce-subscriptions-20260914`
Base: `feature/knowledge-engine-20260913`

## Implemented

- Commerce plan catalog for 7-day PWA pass, PWA monthly, Windows monthly and bundle monthly.
- Supabase billing tables with ENABLE + FORCE RLS.
- Service-role-only billing mutation RPCs.
- Idempotent Stripe event processing by provider event ID.
- Existing `user_entitlements` remains the application access-control layer.
- Stripe-hosted Checkout creation for one-time and subscription modes.
- Stripe Customer Portal session creation.
- Raw-body Stripe webhook signature verification with HMAC-SHA256 and timestamp tolerance.
- TEST/LIVE event-mode separation.
- Stripe Price IDs as source of pricing truth; application source does not hard-code sale amounts.
- Fail-closed `AAS_COMMERCE_MODE` with default `off`.
- LIVE checkout additionally requires public seller/legal contact fields.
- PWA plan page, billing/account page and commercial-transactions disclosure page.
- Draft terms/privacy updates for pass/subscription billing.
- Regression tests and production checklist.

## Intentionally not enabled

- Stripe Products/Prices have not been created by this repository change.
- Stripe secret keys/webhook secrets are not stored in GitHub.
- Production Cloudflare sales routing has not been changed.
- `AAS_COMMERCE_MODE=live` has not been enabled.
- Seller identity/address/phone/email/support URL are not guessed or fabricated.
- Sale prices and refund policy are not guessed or fabricated.

## External release blockers

Before paid TEST E2E can run, an authorized Stripe account must provide TEST Products/Prices, secret key and webhook endpoint secret. Before LIVE sale, seller disclosure fields, final pricing, refund/cancellation wording and Production Stripe objects must be finalized and reviewed.
