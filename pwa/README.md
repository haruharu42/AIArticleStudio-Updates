# AI記事スタジオ PWA — Phase 7

Phase 7 connects the PWA to the existing common-article database. An active
profile with `AAS-PWA-BETA` access can list, read, edit, and delete only its own
cloud articles. Phase 8 article creation and Phase 9 image UI remain disabled.

## Security boundary

- Use only a Supabase publishable key (or the legacy `anon` key).
- Never expose a service-role or `sb_secret_*` key.
- Supabase RLS remains the authorization boundary. The client additionally
  calls `auth.getUser()` and `can_access_product` before every article action,
  and validates returned owner IDs.
- Article lists exclude body and workspace columns. Full content is requested
  only after the owner opens one article.
- Updates use `update_article_with_workspace` with the expected revision.
  Conflicts never overwrite a newer cloud revision and the editor keeps the
  user's unsaved text.
- Deletes remove any associated private Storage objects through the protected
  begin/remove/finalize lifecycle before calling the revision-checked article
  delete RPC. Interrupted image deletion is safe to retry.
- The service worker never caches Supabase requests, OAuth callback URLs,
  article responses, or authenticated API responses.
- `.env*` files are ignored by Git except for the value-free `.env.example`.

## Local verification

1. Copy `.env.example` to `.env.local` and set the public project values.
2. Run `npm run install:ci`.
3. Apply the repository migration
   `20260905133313_phase7_cloud_article_entitlement_enforcement.sql` to the
   linked Supabase project before exposing the Phase 7 UI.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm audit`.

The existing Windows environment names `AAS_SUPABASE_URL`,
`AAS_SUPABASE_PUBLISHABLE_KEY`, and `AAS_SUPABASE_ANON_KEY` are also accepted
at build time. The Phase 7 migration adds database-side Windows-or-PWA
entitlement enforcement without changing existing article rows.

## OAuth redirect

Add both local and final PWA callback URLs to the Supabase redirect allow list:

- `http://localhost:<port>/auth/callback`
- `https://<pwa-host>/auth/callback`

Google OAuth returns through this route using PKCE. The callback explicitly
exchanges the authorization code and records current-term acceptance only when
the user started Google sign-in after checking the consent control.

## Phase boundary

Phase 7 can read and update the signed-in user's existing `articles` and
`article_workspaces` records. It reads `article_assets` metadata only while
performing a confirmed article deletion, so private objects can be removed
safely. It does not create articles, present an image browser, migrate Windows
local articles, change entitlements, or access admin data.
