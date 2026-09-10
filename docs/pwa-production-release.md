# AI Article Studio PWA — Production Release Runbook

## Scope

This runbook prepares the Phase 9–17 PWA for an invite-only production release on Cloudflare Workers. It does not change the Windows updater, `latest.json`, Windows release ZIPs, payment webhooks, server-side AI execution, or automatic SNS/article publication.

## Hosting target

- Runtime: Cloudflare Workers
- Framework path: Next.js 16 + vinext
- Worker name: `ai-article-studio-pwa`
- Initial production URL: `https://<workers-subdomain>.workers.dev`
- Custom domain: optional follow-up after the first production smoke test
- Search indexing: disabled (`noindex`, `nofollow`) because this release is invite-only

Cloudflare account identifiers and API tokens must not be committed. Use `wrangler login` for a manual deployment or secret-store environment variables for CI.

## Required production public configuration

The following browser-visible values are required at build/deploy time:

- `AAS_PWA_PRODUCTION_ORIGIN`
- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AAS_TERMS_URL`
- `NEXT_PUBLIC_AAS_PRIVACY_URL`
- `NEXT_PUBLIC_AAS_AI_TERMS_URL`

Only a Supabase publishable/anon public key is allowed. Never expose a service-role key, `sb_secret_*`, database password, user JWT, DPAPI session, Cloudflare API token, or any server-side AI key to the PWA.

## Supabase Auth URL configuration

After the final HTTPS production origin is known, configure Supabase Authentication > URL Configuration:

1. Site URL: the exact production origin, e.g. `https://example.workers.dev`
2. Redirect URL: the exact callback URL, e.g. `https://example.workers.dev/auth/callback`
3. Keep the local callback used for development/E2E only if local testing still needs it.

The PWA calculates OAuth/email callback URLs from `window.location.origin`, so production will use the deployed origin automatically. The callback page uses the existing PKCE code exchange.

Google OAuth still returns to the Supabase Auth callback first; Supabase must then allow the PWA callback URL above.

## Legal-link gate

Do not publish registration to customers until all three public HTTPS links are real and reviewable:

- Terms of Service
- Privacy Policy
- AI Usage Terms

The production preflight intentionally fails when any of these URLs is missing or non-HTTPS.

## Local production preflight

From `pwa/`, set the production variables without printing secrets, then run:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run production:preflight
npm run typecheck
npm run lint
npm test
npm audit --audit-level=high
```

The preflight verifies HTTPS configuration, rejects secret/service-role material, verifies the manifest/service worker/icons, validates the Cloudflare Workers config, confirms the invite-only robots policy, and checks the PKCE callback implementation.

## Cloudflare authentication

For a manual first release:

```powershell
npx wrangler login
npx wrangler whoami
```

Do not paste or commit the generated authentication token. `CLOUDFLARE_ACCOUNT_ID` may be set in the process environment rather than committed to `wrangler.jsonc`.

## Deploy command

From `pwa/` after preflight passes:

```powershell
npm run deploy:cloudflare
```

The deploy script pins the Cloudflare deploy helper to the same vinext beta line used by this PWA. Deployment must be run only after the production origin, legal URLs, Supabase URL/publishable key, Cloudflare account, and Supabase Auth redirect allow-list are ready.

## First-production smoke test

Immediately after the first deploy, verify:

1. `GET /healthz` returns HTTP 200 and `{ ok: true, app: "ai-article-studio-pwa", phase: 17 }`.
2. `/manifest.webmanifest`, `/sw.js`, `/icon-192.png`, and `/icon-512.png` return HTTP 200.
3. The root page loads over HTTPS and remains `noindex`/`nofollow`.
4. Email/password login works for an approved account with PWA entitlement.
5. Google OAuth completes through `/auth/callback` without a redirect mismatch.
6. A user without PWA entitlement is denied.
7. An active admin can access the admin dashboard without a purchased entitlement.
8. Create one disposable article, confirm article/Workspace/image-plan save, then delete it.
9. Confirm Windows sees only the same owner's cloud article data.
10. Verify signed image access and private Storage owner isolation.
11. Install the PWA on at least one mobile browser and launch it in standalone mode.
12. Disable the network and confirm the offline fallback appears without exposing cached authenticated data.

## Rollback

If the first production smoke test fails:

- Do not alter Windows `latest.json` or Windows release artifacts.
- Roll back the Cloudflare Worker deployment/version to the previous known-good deployment.
- Keep Supabase migrations append-only; do not destructively rewrite migration history.
- If an Auth redirect change caused the issue, restore the last known-good Site URL / Redirect URL entries.
- Record the failing production URL, deployment version, route, browser, and exact error before retrying.

## Release boundary

This production release exposes the existing Phase 9–17 PWA only. It does not yet provide:

- automatic payment-webhook entitlement activation
- server-side OpenAI/AI model execution
- automatic image-generation API execution
- note/Tips/Brain automatic publication
- X/Instagram/Threads automatic posting
- external traffic/sales/SNS analytics ingestion

Those capabilities require separate server-side credentials, provider contracts, and release gates.
