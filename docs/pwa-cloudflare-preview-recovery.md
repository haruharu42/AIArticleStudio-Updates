# Cloudflare Preview URL recovery (2026-09-11)

This note records the recovery path for the first external PWA preview. It does not authorize a production Worker route, custom domain, PR merge, Windows updater change, or `latest.json` change.

## Confirmed state

- Worker: `ai-article-studio-pwa-preview`
- Worker bootstrap deployment: completed
- Worker production `workers.dev`: disabled
- Worker Preview URLs: enabled
- Production custom routes: none
- Bootstrap version exists.
- A second version created by the approved preview upload exists and carries the expected message for HEAD `7cbdb47c05961660de3cedb01e9fb15e92f07e95`.
- That second version is not the current production deployment.
- No routable version/alias Preview URL was returned for the second version.
- Read-only diagnostics confirmed the Cloudflare account has no account-level `workers.dev` subdomain: `GET /accounts/{account_id}/workers/subdomain` returned HTTP 404 / Cloudflare code 10007.
- Repository state was restored to clean after removing only generated Wrangler cache state.

## Root cause

Worker Preview URLs use the account's `workers.dev` namespace. `preview_urls=true` on the Worker is necessary but not sufficient when the account has never created a `workers.dev` subdomain.

Creating the account-level subdomain is an account-wide Cloudflare setting. It must therefore be guarded separately from Worker version upload/deployment.

## Guarded recovery helper

Use `scripts/Configure-AAS-Cloudflare-Account-Subdomain.ps1`.

Default requested account subdomain:

`ai-article-studio`

Safety contract:

- requires the existing Worker to be found under the authenticated account;
- requires Worker production `workers.dev` to remain disabled;
- requires Worker Preview URLs to remain enabled;
- reads the account-level subdomain first;
- refuses to rename a different pre-existing account-wide subdomain;
- treats HTTP 404 / Cloudflare code 10007 as the expected "not configured" state;
- requires `-ConfirmCreateAccountSubdomain` before the account-wide PUT;
- performs no Worker version upload;
- performs no Worker deployment;
- performs no production routing/custom-domain change;
- verifies the account subdomain after creation;
- re-verifies Worker production `workers.dev` remains disabled and previews remain enabled;
- probes the expected existing alias URL read-only;
- writes a secret-free report to `Downloads\AIArticleStudio-Cloudflare-Account-Subdomain.json`.

## Expected branch after account-subdomain creation

If the existing `aas-preview` alias becomes reachable after the account namespace is created, reuse that URL and continue to Supabase Auth redirect allow-list validation.

If the existing alias remains unroutable, do not modify production routing. Use the already-approved preview-only publisher to create one fresh version with `wrangler versions upload --preview-alias aas-preview`. The Worker configuration must remain `workers_dev=false` and `preview_urls=true`.

After a Preview URL is externally reachable, continue with:

1. add `<preview-origin>/auth/callback` to the Supabase Auth redirect allow-list without removing local/test redirects;
2. verify Email/Password and Google OAuth/PKCE redirects;
3. run external preview E2E;
4. clean exact-ID E2E data;
5. keep production routing/custom domain as a separate explicit release decision.
