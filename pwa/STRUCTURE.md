# PWA Structure Boundaries

AI Article Studio PWA keeps responsibilities separated so UI changes, business logic changes, and access-control changes can be reviewed independently.

## Runtime boundaries

- `app/`: route entry points and route-level composition only.
- `components/`: interactive UI and presentation components.
- `components/article-create/`: article-creation step UI; no direct profile or entitlement queries.
- `components/admin-users/`: admin user-management presentation panels; callbacks only, with no direct Supabase mutation ownership.
- `components/pwa-admin-users-page.tsx`: admin user-management controller; owns loading, selection, mutation orchestration, refresh, and messages.
- `lib/access-control.ts`: authenticated profile validation and authoritative PWA entitlement checks.
- `lib/admin-users-view.ts`: pure admin-user filtering, labels, date formatting, and summary calculations.
- `lib/article-create-draft.ts`: pure article-draft defaults, URL parsing, tag parsing, step validation, and restored-draft validation.
- `lib/phase11-create.ts`: article creation business/persistence contract.
- `lib/phase11-wizard-progress.ts`: browser progress persistence; restored data must pass `parseStoredArticleDraft` before use.
- `lib/phase6-access.ts`: product access orchestration, including optional free-trial bootstrap, built on the shared access-control boundary.

## Rules for new work

1. UI components must not duplicate profile ownership or PWA entitlement RPC logic.
2. Product access checks go through `access-control.ts` or an orchestrator built on it.
3. Browser-stored data is untrusted and must be parsed before use.
4. Pure parsing/validation/filtering/formatting belongs in `lib/`, not inside page components.
5. Large workflow screens should keep orchestration in the parent and move independent visual steps/panels into focused components.
6. Presentation panels receive data and callbacks; they do not own Supabase mutation clients.
7. Refresh and loading orchestration stays in the controller so selection changes do not accidentally trigger duplicate full-page fetches.
8. Database/RLS/RPC changes remain separate from UI-only refactors unless a behavior change explicitly requires them.
10. New boundaries must be protected by regression tests before old code is removed.

This document describes the active PWA code organization only; it does not change database contracts or release infrastructure.
