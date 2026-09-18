# Knowledge / Prompt Auto Update v1

## Purpose

AI Article Studio keeps editorial knowledge and AI-provider prompt guidance fresh without silently trusting arbitrary Web content.

The system is intentionally **review-gated**:

1. PostgreSQL schedules Fresh / Stable refresh requests.
2. An active admin opens the Knowledge control screen.
3. A Web-capable AI researches current information using the generated research prompt.
4. The admin reviews the returned JSON and source URLs.
5. A single atomic RPC validates and publishes the approved bundle.
6. Fresh rules are available to Fresh users immediately.
7. Fresh-first rules become available to Stable users after the configured Stable delay.
8. Runtime clients load the latest accessible Knowledge and Prompt optimization version without a PWA redeploy.

## Channels

- **Fresh**: refresh interval 48 hours. Intended for early access after administrator verification.
- **Stable**: refresh interval 168 hours. Intended for slower, conservative updates.

Refresh intervals continue to use `knowledge_refresh_channels` and `creator_system_settings`.

## Automatic versus manual work

Automatic:
- refresh due detection and queue creation
- channel/version tracking
- runtime loading
- provider / plan / task matching
- Fresh -> Stable time gate
- article workspace version trace
- validation of the publication bundle

Administrator review required:
- Web research
- source verification
- deciding whether a change is durable enough to become Knowledge
- final JSON publication

AAS does **not** ship a browser API key, service role key, or automatic external-AI publishing path.

## Prompt optimization matching

Cloud Prompt rules can target:

- Provider: `all | chatgpt | claude | gemini`
- Plan: `all | free | paid`
- Task: `all | title | article | image | social | promotion`

The compiled Cloud Prompt block is subordinate to:
1. safety and factuality,
2. the user's current instructions,
3. article/platform constraints.

## Source requirements

Every auto-update Knowledge or Prompt item requires at least one source URL. The research prompt instructs the operator to prefer official documentation and to use multiple independent sources when practical.

Auto-update keys must begin with `auto:` so research updates cannot overwrite built-in seed rules or candidate-review rules.

## Database objects

Migration: `20260919083000_knowledge_prompt_auto_update.sql`

Adds:
- source/version metadata to `knowledge_catalog`
- audit/version fields to `knowledge_refresh_requests`
- `prompt_optimization_catalog`
- runtime list/state RPCs
- admin queue/start/fail/publish RPCs
- atomic `admin_publish_knowledge_refresh_bundle`

The Prompt catalog has RLS enabled and forced, with no direct anon/authenticated table access.

## Release rule

Do not merge or deploy to the Member Beta Worker until:
- PWA CI passes,
- Production Preflight passes,
- migration applies successfully to the current Supabase project,
- Preview authenticated smoke test passes.

No Windows updater/release/latest.json, Stripe LIVE, custom domain, or DNS change is part of this phase.
