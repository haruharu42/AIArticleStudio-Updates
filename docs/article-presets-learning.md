# Article Presets + Learning v1

## Goal

Let each user keep reusable article setup presets so a note genre can be selected in one tap, while AAS learns only small structured usage signals to improve future prompt context.

## Preset contents

A preset stores:

- publication target
- free / paid article type and price
- genre / subgenre
- target age group / gender
- target length
- affiliate setting
- generation mode
- cover / inline image settings
- tags

A preset never stores article title, theme, article body, AI response, or the full exported prompt.

## User experience

The article creator shows `いつものnote設定` above the wizard.

Users can:

- apply a saved preset with one tap
- save the current setup as a new preset
- overwrite the active preset with current settings
- choose one preset as the default for a brand-new blank article
- delete presets
- keep up to 30 presets per account

The active preset ID is kept in the local wizard recovery state so reopening the PWA does not lose the preset association before the article is saved.

## Learning signals

When `あなた向け最適化` is ON and an article is saved, AAS aggregates:

- publication target
- genre
- subgenre
- free / paid article type
- age group
- target length
- preset usage

These are counts only. The current ARTICLE BRIEF always overrides learned preferences.

Preset usage count itself is updated when a saved article is associated with that preset, even if personalization is OFF. This supports preset sorting without making the prompt personalization profile active.

## Database

Migration: `20260919094500_article_presets_learning.sql`

- adds `article_presets`
- uses self-only RLS + FORCE RLS
- allows only authenticated active users to CRUD their own rows
- adds richer aggregate JSON counters to `user_writing_profiles`
- adds `record_my_article_workflow_signal`
- keeps the old `record_my_personalization_signal` RPC for backward compatibility

## Privacy and safety

The learning profile does not contain raw article content, AI response content, or full prompt history. Preset CRUD is an explicit user action. Aggregate learning only updates when personalization is enabled.

No Windows updater/release/latest.json, Stripe LIVE, custom domain, DNS, or production Cloudflare routing change is part of this phase.
