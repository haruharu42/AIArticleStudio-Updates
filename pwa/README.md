# AI記事スタジオ PWA — Phase 6

Phase 6 establishes the PWA shell, Supabase Auth, active-profile check, and
`AAS-PWA-BETA` entitlement gate. Article library, article creation, and image
features intentionally remain disabled until later phases.

## Security boundary

- Use only a Supabase publishable key (or the legacy `anon` key).
- Never expose a service-role or `sb_secret_*` key.
- Authorization remains enforced by the existing Supabase RLS and
  `can_access_product` RPC; the client-side screen gate is not the security
  boundary.
- The service worker never caches Supabase requests, OAuth callback URLs,
  article responses, or authenticated API responses.
- `.env*` files are ignored by Git.

## Local verification

1. Copy `.env.example` to `.env.local` and set the public project values.
2. Run `npm run install:ci` (Windows/macOS/Linux対応)。
3. Run `npm run typecheck`, `npm run lint`, and `npm test`.

The existing Windows environment names `AAS_SUPABASE_URL`,
`AAS_SUPABASE_PUBLISHABLE_KEY`, and `AAS_SUPABASE_ANON_KEY` are also accepted
at build time. No Supabase migration is required for Phase 6.

## OAuth redirect

Add both local and final PWA callback URLs to the Supabase redirect allow list:

- `http://localhost:<port>/auth/callback`
- `https://<pwa-host>/auth/callback`

Google OAuth returns through this route using PKCE. The callback explicitly
exchanges the authorization code and records current-term acceptance only when
the user started Google sign-in after checking the consent control.

## Phase boundary

Phase 6 may read only the signed-in user's `profiles` row and call
`can_access_product` / `accept_current_terms`. It does not read or mutate
articles, workspaces, images, Windows local data, entitlements, or admin data.
