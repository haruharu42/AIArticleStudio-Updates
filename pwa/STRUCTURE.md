# PWA Structure Boundaries

AI Article Studio PWA keeps responsibilities separated so UI changes, business logic changes, and access-control changes can be reviewed independently.

## Runtime boundaries

- `app/`: route entry points and route-level composition only.
- `components/`: interactive UI and presentation components.
- `components/article-create/`: article-creation step UI; no direct profile or entitlement queries.
- `lib/access-control.ts`: authenticated profile validation and authoritative PWA entitlement checks.
- `lib/article-create-draft.ts`: pure article-draft defaults, URL parsing, tag parsing, step validation, and restored-draft validation.
- `lib/phase11-create.ts`: article creation business/persistence contract.
- `lib/phase11-wizard-progress.ts`: browser progress persistence; restored data must pass `parseStoredArticleDraft` before use.
- `lib/phase6-access.ts`: product access orchestration, including optional free-trial bootstrap, built on the shared access-control boundary.

## Rules for new work

1. UI components must not duplicate profile ownership or PWA entitlement RPC logic.
2. Product access checks go through `access-control.ts` or an orchestrator built on it.
3. Browser-stored data is untrusted and must be parsed before use.
4. Pure parsing/validation belongs in `lib/`, not inside page components.
5. Large workflow screens should keep orchestration in the parent and move independent visual steps/panels into focused components.
6. Database/RLS/RPC changes remain separate from UI-only refactors unless a behavior change explicitly requires them.
7. New boundaries must be protected by regression tests before old code is removed.

This document describes the active PWA code organization only; it does not change database contracts or release infrastructure.
