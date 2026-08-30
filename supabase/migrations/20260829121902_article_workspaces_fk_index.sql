-- Phase 5A follow-up: cover the composite article/workspace ownership FK.
-- The original article_workspaces Migration is already applied and is not
-- edited. This index keeps parent article deletes and FK checks efficient.

create index article_workspaces_article_owner_idx
on public.article_workspaces (article_id, user_id);
