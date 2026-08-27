-- Phase 4 follow-up: cover the composite article_assets -> articles ownership FK.
-- The original applied migration is intentionally left unchanged.
create index article_assets_article_user_idx
    on public.article_assets (article_id, user_id);
