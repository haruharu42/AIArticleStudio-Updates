# AAS PWA feature boundaries — Phase 45

`pwa/features/` is the preferred import boundary for product-domain code.

## Domains

- `article/` — article draft, presets, cloud article data
- `account-design/` — note / Tips / Brain account design and article linkage
- `note/` — note operations assistant and rich-text helpers
- `workflow/` — operations cockpit, pre-publish checks, SNS reuse, series planning
- `social/` — SNS generation and SNS plan logic
- `images/` — image planning, image prompts, file naming
- `presets/` — cross-feature shared workspace presets
- `support/` — authenticated inquiries
- `admin/` — admin promotion, operations, sales, user/admin view helpers
- `navigation/` — shared navigation preferences

## Compatibility policy

Phase 45 intentionally does **not** mass-move all legacy `pwa/lib/phaseXX-*.ts` files.
Those paths are already covered by extensive regression tests and are used by both old and new UI code.

New or actively edited UI should import domain logic through `@/features/<domain>` when practical.
Legacy imports remain supported until they can be migrated in small verified batches.

This keeps the final structural cleanup low-risk while giving future development a stable domain-oriented structure.
