-- User-data isolation hardening.
-- Defense in depth only: preserve existing product behavior while making
-- accidental cross-user reads/writes harder to introduce later.

-- 1) Keep RLS mandatory on every table that contains per-user or sensitive
-- operational/payment data. FORCE RLS is intentional for these tables.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.articles enable row level security;
alter table public.articles force row level security;
alter table public.article_workspaces enable row level security;
alter table public.article_workspaces force row level security;
alter table public.article_assets enable row level security;
alter table public.article_assets force row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;
alter table public.user_writing_profiles enable row level security;
alter table public.user_writing_profiles force row level security;
alter table public.billing_checkout_sessions enable row level security;
alter table public.billing_checkout_sessions force row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscriptions force row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;
alter table public.billing_events enable row level security;
alter table public.billing_events force row level security;
alter table public.pwa_invites enable row level security;
alter table public.pwa_invites force row level security;
alter table public.pwa_invite_redemptions enable row level security;
alter table public.pwa_invite_redemptions force row level security;
alter table public.user_free_trials enable row level security;
alter table public.user_free_trials force row level security;
alter table public.free_trial_daily_usage enable row level security;
alter table public.free_trial_daily_usage force row level security;
alter table public.admin_user_actions enable row level security;
alter table public.admin_user_actions force row level security;
alter table public.commerce_sales_settings enable row level security;
alter table public.commerce_sales_settings force row level security;
alter table public.knowledge_candidate_signals enable row level security;
alter table public.knowledge_candidate_signals force row level security;
alter table public.knowledge_candidate_decisions enable row level security;
alter table public.knowledge_candidate_decisions force row level security;
alter table public.ops_audit_runs enable row level security;
alter table public.ops_audit_runs force row level security;
alter table public.ops_audit_findings enable row level security;
alter table public.ops_audit_findings force row level security;
alter table public.ops_events enable row level security;
alter table public.ops_events force row level security;
alter table public.ops_health_checks enable row level security;
alter table public.ops_health_checks force row level security;
alter table public.ops_capacity_settings enable row level security;
alter table public.ops_capacity_settings force row level security;

-- 2) Anonymous clients never receive direct table access to user/sensitive data.
revoke all on table
    public.profiles,
    public.articles,
    public.article_workspaces,
    public.article_assets,
    public.user_entitlements,
    public.user_writing_profiles,
    public.billing_checkout_sessions,
    public.billing_subscriptions,
    public.billing_customers,
    public.billing_events,
    public.pwa_invites,
    public.pwa_invite_redemptions,
    public.user_free_trials,
    public.free_trial_daily_usage,
    public.admin_user_actions,
    public.commerce_sales_settings,
    public.knowledge_candidate_signals,
    public.knowledge_candidate_decisions,
    public.ops_audit_runs,
    public.ops_audit_findings,
    public.ops_events,
    public.ops_health_checks,
    public.ops_capacity_settings
from anon;

-- 3) Signed-in clients get only the direct table privileges that the current
-- application intentionally needs. RLS remains the authoritative row boundary.
-- Article/profile/billing reads are self-only through their existing policies.
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

revoke all on table public.articles from authenticated;
grant select on table public.articles to authenticated;

revoke all on table public.article_workspaces from authenticated;
grant select on table public.article_workspaces to authenticated;

revoke all on table public.article_assets from authenticated;
grant select on table public.article_assets to authenticated;

revoke all on table public.user_entitlements from authenticated;
grant select on table public.user_entitlements to authenticated;

revoke all on table public.billing_checkout_sessions from authenticated;
grant select on table public.billing_checkout_sessions to authenticated;

revoke all on table public.billing_subscriptions from authenticated;
grant select on table public.billing_subscriptions to authenticated;

-- Writing preferences are the one intentionally client-editable user table;
-- its existing SELECT/INSERT/UPDATE/DELETE policies all require user_id=auth.uid().
revoke all on table public.user_writing_profiles from authenticated;
grant select, insert, update, delete on table public.user_writing_profiles to authenticated;

-- Everything below is RPC/server controlled. No direct client table access.
revoke all on table
    public.billing_customers,
    public.billing_events,
    public.pwa_invites,
    public.pwa_invite_redemptions,
    public.user_free_trials,
    public.free_trial_daily_usage,
    public.admin_user_actions,
    public.commerce_sales_settings,
    public.knowledge_candidate_signals,
    public.knowledge_candidate_decisions,
    public.ops_audit_runs,
    public.ops_audit_findings,
    public.ops_events,
    public.ops_health_checks,
    public.ops_capacity_settings
from authenticated;

-- 4) Storage ownership is checked twice: by prepared article_assets metadata
-- and by the first path segment. Valid AAS paths are
-- <auth.uid()>/<article_id>/<asset_id>.<ext>, so this does not change normal use.
drop policy if exists article_assets_storage_insert_prepared on storage.objects;
create policy article_assets_storage_insert_prepared
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'article-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'pending_upload'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

drop policy if exists article_assets_storage_select_ready on storage.objects;
create policy article_assets_storage_select_ready
on storage.objects
for select
to authenticated
using (
    bucket_id = 'article-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'ready'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

drop policy if exists article_assets_storage_select_delete_pending on storage.objects;
create policy article_assets_storage_select_delete_pending
on storage.objects
for select
to authenticated
using (
    bucket_id = 'article-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

drop policy if exists article_assets_storage_delete_pending on storage.objects;
create policy article_assets_storage_delete_pending
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'article-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

-- No UPDATE policy is created for article-assets Storage objects. Overwrite/upsert
-- remains intentionally unavailable; replacement uses the checked delete/create flow.
