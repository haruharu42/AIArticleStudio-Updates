# AI Action Studio — Sales Release Roadmap

Created: 2026-09-25

This roadmap is execution order, not permission to publish Production. Re-read live GitHub, CI, Preview and Supabase before every phase.

## Phase 1 — Tester critical-path E2E

Status: in progress.

- [x] Admin Web Push real-device delivery/tap verified.
- [x] Notification Center moved to Tester rollout.
- [x] Designated non-admin tester can access Tester notification UI.
- [ ] Tester device creates/enables a Web Push subscription.
- [ ] Send Tester-only push and verify receipt/tap.
- [ ] Re-check article creation, external-AI return, core side-hustle workflow and mobile navigation on Tester.

Blocker: the tester push step requires an actual tester-device subscription and must not be bypassed by moving Notifications to Public.

## Phase 2 — Security and robustness before sale

Status: active.

Completed:

- [x] Retire browser-role access to unused public sales SECURITY DEFINER RPC.
- [x] Confirm all authenticated `admin_*` SECURITY DEFINER functions use the active-admin guard.
- [x] Confirm authenticated SECURITY DEFINER functions use empty `search_path`.
- [x] Remove `auth_rls_initplan` performance warnings from home-widget policies.
- [x] Add remaining missing foreign-key indexes.

Remaining:

- [ ] Review Supabase Auth leaked-password protection.
- [ ] Classify the remaining intentional SECURITY DEFINER warnings by feature family rather than changing them only to silence the advisor.
- [ ] Review `pg_net` public-schema extension impact before attempting any schema move.
- [ ] Re-run advisors after each database security change.

## Phase 3 — External-sale + access-code E2E

Status: configuration partially ready.

Required configuration:

- [x] External sales switch enabled.
- [x] Access-code switch enabled.
- [ ] Real HTTPS external purchase URL configured.
- [ ] Verify external purchase CTA appears only when URL is valid.
- [ ] Verify access code issuance operational process.
- [ ] Verify eligible user redemption grants the correct PWA entitlement.
- [ ] Verify duplicate/expired/exhausted code failures.
- [ ] Verify turning new redemption off does not revoke existing access.

This is the recommended first paid-launch path.

## Phase 4 — Legal and support finalization

- [ ] Finalize sales price/offer on the chosen external platform.
- [ ] Finalize refund/cancellation wording.
- [ ] Re-check Terms, Privacy and AI terms.
- [ ] Re-check commercial-transactions disclosure.
- [ ] Re-check support and seller-disclosure response process.
- [ ] Verify no private seller data is exposed outside the selected disclosure mode.

## Phase 5 — Closed paid beta

- [ ] Sell to a small controlled group through the external-sales route.
- [ ] Verify purchase -> code -> registration -> entitlement -> actual usage.
- [ ] Record support questions and failure points.
- [ ] Use Feature Control maintenance mode for a faulty feature instead of disabling the whole PWA.
- [ ] Resolve critical/high issues before widening rollout.

## Phase 6 — Promotion package

- [x] Dropdown-first Sales & Promotion Center.
- [x] Three-step promotion setup.
- [x] Latest-Preview screenshot request builder.
- [ ] Create release article from current exact Preview.
- [ ] Capture safe PC/mobile screenshots.
- [ ] Produce note article, X posts and FAQ/update material.
- [ ] Human-review price, availability, rollout stage and screenshots immediately before publishing.

## Phase 7 — General PWA sale

Requires explicit approval.

- [ ] Final release-candidate CI fully green.
- [ ] Real-device critical flows green.
- [ ] Closed paid beta issues resolved.
- [ ] Legal/support checks complete.
- [ ] Decide which Tester features move to Public.
- [ ] Explicitly approve Production route/domain release.
- [ ] Publish the external purchase page/CTA.
- [ ] Monitor inquiries, notification delivery, entitlements and feature health.

## Phase 8 — Optional Stripe route

Not required for first sale.

- [ ] Create Stripe TEST PWA Products/Prices.
- [ ] Configure Preview TEST secrets.
- [ ] Complete Checkout/webhook/idempotency/failure/Portal E2E.
- [ ] Re-check seller disclosure and cancellation policy.
- [ ] Explicitly approve Stripe LIVE.
- [ ] Create separate LIVE Products/Prices/Webhook/secrets.
- [ ] Enable PWA Stripe sale switches only after LIVE validation.

## Phase 9 — Ongoing operation

- Knowledge/source health monitoring
- notification/update communication
- support inquiry triage
- feature rollout/maintenance control
- sales/conversion analysis
- promotion refresh using current Preview screenshots
- periodic security/advisor review
