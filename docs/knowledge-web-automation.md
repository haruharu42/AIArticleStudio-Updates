# Knowledge Web Automation

AI Action Studio (AAS) keeps curated seed Knowledge in code and versioned cloud Knowledge in Supabase.

## Automation boundary

The automation layer may:

1. Poll registered official / primary source URLs.
2. Use ETag / Last-Modified when available.
3. Hash normalized page content and detect material source changes.
4. Detect 404 / 410 and repeated retrieval failures.
5. Treat official changelog / release hubs as discovery signals.
6. Create review candidates: `new`, `update`, `recheck`, or `retire`.
7. Generate a candidate-specific verification prompt.

The automation layer must **not** publish Knowledge or Prompt rules.

## Publication boundary

A candidate approval only means that an administrator wants to continue verification. Final publication remains a separate flow:

`official-source candidate -> source verification -> JSON bundle -> Quality Gate -> current-data diff -> admin confirmation -> Fresh / Stable publish`

The Edge Function has no call to the Knowledge publication RPC.

## Scheduling

- `aas-knowledge-research-worker-6h`: invokes the source monitor every six hours.
- Each tracked source normally has a 24-hour recheck interval.
- The worker processes a bounded number of due sources per run.
- Existing Fresh / Stable scheduling remains independent.

## Security

- The worker is authenticated with a dedicated random token stored in Supabase Vault.
- Only the SHA-256 token hash is stored in the automation settings table.
- The service-role credential is never passed through the scheduled HTTP request.
- Existing Knowledge / Prompt tables keep their direct Data API restrictions.
- The worker reads a minimal catalog snapshot through a service-role-only SECURITY DEFINER RPC.
- Admin-facing RPCs still verify `private.is_active_admin()`.

## Discovery policy

Normal official pages are change monitors only. New-page discovery is intentionally disabled for ordinary pages to avoid noisy candidates.

Official changelog / release sources are tracked separately. When a changelog's own content hash changes, the worker creates a `new` candidate so an administrator can verify whether a new reusable Knowledge / Prompt rule is warranted.


## Provider update hubs

The monitored source set includes provider update hubs for OpenAI API changes, Gemini API release notes, and Anthropic model lifecycle / prompting guidance. These hubs establish a baseline hash on first observation; only later changes create review candidates.
