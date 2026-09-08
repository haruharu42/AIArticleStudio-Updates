-- Phase 7: enforce a valid Windows or PWA product entitlement at the database
-- boundary for shared cloud articles and private article images.
--
-- Client-side feature gates remain useful UX, but are not authorization.

begin;

create or replace function private.require_cloud_article_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    -- Preserve trusted maintenance and service-role cleanup paths. Browser and
    -- Windows API requests run as session_user=authenticator and never enter
    -- this branch, even though this trigger itself is SECURITY DEFINER.
    if session_user in ('postgres', 'supabase_admin')
       or (select auth.role()) = 'service_role' then
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    if not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required'
            using errcode = '42501';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$function$;

revoke all on function private.require_cloud_article_entitlement()
from public, anon, authenticated, service_role;

drop trigger if exists articles_require_cloud_entitlement
on public.articles;
create trigger articles_require_cloud_entitlement
before insert or update or delete on public.articles
for each row execute function private.require_cloud_article_entitlement();

drop trigger if exists article_workspaces_require_cloud_entitlement
on public.article_workspaces;
create trigger article_workspaces_require_cloud_entitlement
before insert or update or delete on public.article_workspaces
for each row execute function private.require_cloud_article_entitlement();

drop trigger if exists article_assets_require_cloud_entitlement
on public.article_assets;
create trigger article_assets_require_cloud_entitlement
before insert or update or delete on public.article_assets
for each row execute function private.require_cloud_article_entitlement();

drop policy if exists articles_select_own_active on public.articles;
create policy articles_select_own_active
on public.articles
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
);

drop policy if exists article_workspaces_select_own_active
on public.article_workspaces;
create policy article_workspaces_select_own_active
on public.article_workspaces
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
);

drop policy if exists article_assets_select_own_active
on public.article_assets;
create policy article_assets_select_own_active
on public.article_assets
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
);

drop policy if exists article_assets_storage_insert_prepared
on storage.objects;
create policy article_assets_storage_insert_prepared
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'article-assets'
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'pending_upload'
          and asset.storage_bucket = bucket_id
          and asset.storage_path = name
    )
);

drop policy if exists article_assets_storage_select_ready
on storage.objects;
create policy article_assets_storage_select_ready
on storage.objects
for select
to authenticated
using (
    bucket_id = 'article-assets'
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'ready'
          and asset.storage_bucket = bucket_id
          and asset.storage_path = name
    )
);

drop policy if exists article_assets_storage_select_delete_pending
on storage.objects;
create policy article_assets_storage_select_delete_pending
on storage.objects
for select
to authenticated
using (
    bucket_id = 'article-assets'
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
          and asset.storage_bucket = bucket_id
          and asset.storage_path = name
    )
);

drop policy if exists article_assets_storage_delete_pending
on storage.objects;
create policy article_assets_storage_delete_pending
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'article-assets'
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
          and asset.storage_bucket = bucket_id
          and asset.storage_path = name
    )
);

create or replace function public.get_article_workspace(
    p_article_id uuid
)
returns public.article_workspaces
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    selected_workspace public.article_workspaces%rowtype;
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required'
            using errcode = '42501';
    end if;

    select workspace.*
    into selected_workspace
    from public.article_workspaces as workspace
    where workspace.article_id = p_article_id
      and workspace.user_id = current_user_id;

    if not found then
        raise exception 'article workspace not found' using errcode = 'P0002';
    end if;

    return selected_workspace;
end;
$function$;

revoke all on function public.get_article_workspace(uuid)
from public, anon;
grant execute on function public.get_article_workspace(uuid)
to authenticated;

create or replace function public.get_my_article_stock_summary()
returns table (
    current_articles bigint,
    max_articles integer,
    remaining_articles bigint,
    is_unlimited boolean,
    publication_counts jsonb,
    status_counts jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_profile_role text;
    current_profile_status text;
    current_count bigint;
    max_count integer;
    publication_totals jsonb;
    status_totals jsonb;
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required'
            using errcode = '42501';
    end if;

    select profile.role, profile.status
    into current_profile_role, current_profile_status
    from public.profiles as profile
    where profile.id = current_user_id;

    if not found or current_profile_status <> 'active' then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if current_profile_role not in ('user', 'admin') then
        raise exception 'unsupported profile role' using errcode = '42501';
    end if;

    select count(*)
    into current_count
    from public.articles as article
    where article.user_id = current_user_id;

    select
        jsonb_build_object('note', 0, 'tips', 0, 'brain', 0, 'blog', 0)
        || coalesce(
            jsonb_object_agg(counts.publication_target, counts.article_count),
            '{}'::jsonb
        )
    into publication_totals
    from (
        select article.publication_target, count(*) as article_count
        from public.articles as article
        where article.user_id = current_user_id
        group by article.publication_target
    ) as counts;

    select
        jsonb_build_object(
            'draft', 0,
            'writing', 0,
            'ready', 0,
            'waiting_publish', 0,
            'published', 0,
            'on_hold', 0,
            'archived', 0
        ) || coalesce(
            jsonb_object_agg(counts.status, counts.article_count),
            '{}'::jsonb
        )
    into status_totals
    from (
        select article.status, count(*) as article_count
        from public.articles as article
        where article.user_id = current_user_id
        group by article.status
    ) as counts;

    if current_profile_role = 'admin' then
        return query select
            current_count,
            null::integer,
            null::bigint,
            true,
            publication_totals,
            status_totals;
        return;
    end if;

    select quota.default_max_articles
    into max_count
    from public.article_quota_settings as quota
    where quota.setting_key = 'default';

    if max_count is null then
        raise exception using
            errcode = 'P0001',
            message = 'article_quota_configuration_missing';
    end if;

    return query select
        current_count,
        max_count,
        greatest(max_count::bigint - current_count, 0::bigint),
        false,
        publication_totals,
        status_totals;
end;
$function$;

revoke all on function public.get_my_article_stock_summary()
from public, anon;
grant execute on function public.get_my_article_stock_summary()
to authenticated;

comment on function private.require_cloud_article_entitlement() is
    'Trigger guard: shared cloud articles require an active Windows or PWA entitlement.';

do $validation$
declare
    protected_trigger_count integer;
    protected_policy_count integer;
begin
    select count(*)
    into protected_trigger_count
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as table_row
      on table_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as schema_row
      on schema_row.oid = table_row.relnamespace
    where not trigger_row.tgisinternal
      and schema_row.nspname = 'public'
      and trigger_row.tgname in (
          'articles_require_cloud_entitlement',
          'article_workspaces_require_cloud_entitlement',
          'article_assets_require_cloud_entitlement'
      );

    if protected_trigger_count <> 3 then
        raise exception 'Phase 7 entitlement trigger validation failed';
    end if;

    select count(*)
    into protected_policy_count
    from pg_catalog.pg_policies as policy_row
    where (
        policy_row.schemaname = 'public'
        and policy_row.tablename in (
            'articles',
            'article_workspaces',
            'article_assets'
        )
        and policy_row.policyname in (
            'articles_select_own_active',
            'article_workspaces_select_own_active',
            'article_assets_select_own_active'
        )
        and policy_row.qual like '%can_access_product%'
    ) or (
        policy_row.schemaname = 'storage'
        and policy_row.tablename = 'objects'
        and policy_row.policyname in (
            'article_assets_storage_insert_prepared',
            'article_assets_storage_select_ready',
            'article_assets_storage_select_delete_pending',
            'article_assets_storage_delete_pending'
        )
        and coalesce(policy_row.qual, policy_row.with_check, '')
            like '%can_access_product%'
    );

    if protected_policy_count <> 7 then
        raise exception 'Phase 7 entitlement policy validation failed';
    end if;
end;
$validation$;

commit;
