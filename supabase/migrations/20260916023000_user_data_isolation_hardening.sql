begin;

-- Defense in depth for internal tables that must never be queried directly by
-- browser roles. These tables were already protected by FORCE RLS and lacked
-- direct grants; explicit deny policies make the contract auditable and harder
-- to weaken accidentally in a future migration.
do $block$
declare
    table_name text;
begin
    foreach table_name in array array[
        'admin_user_actions',
        'article_quota_settings',
        'billing_customers',
        'billing_events',
        'commerce_sales_settings',
        'knowledge_candidate_decisions',
        'knowledge_candidate_signals',
        'pwa_invite_redemptions',
        'pwa_invites'
    ]
    loop
        execute format('alter table public.%I enable row level security', table_name);
        execute format('alter table public.%I force row level security', table_name);
        execute format('drop policy if exists %I on public.%I', table_name || '_deny_direct', table_name);
        execute format(
            'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
            table_name || '_deny_direct',
            table_name
        );
        execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    end loop;
end;
$block$;

-- Continuously validate the contracts that prevent one signed-in user from
-- reading another user's profile, articles, images, entitlements, billing
-- records, or administrator-only data.
create or replace function private.ops_run_user_data_isolation_audit()
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
    issue_count integer := 0;
    violation_count integer := 0;
begin
    -- Anonymous browser access is intentionally limited to active commerce
    -- plan display data. Any other public-schema table grant is unexpected.
    select count(*)::integer
      into violation_count
      from information_schema.role_table_grants grants
     where grants.table_schema = 'public'
       and grants.grantee = 'anon'
       and grants.table_name <> 'commerce_plans';

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_DATA_ANON_TABLE_GRANT',
            'Anonymous role has an unexpected direct privilege on a public table.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Internal control/audit tables are RPC-only. Even authenticated users
    -- must not receive direct table privileges.
    select count(*)::integer
      into violation_count
      from information_schema.role_table_grants grants
     where grants.table_schema = 'public'
       and grants.grantee in ('anon', 'authenticated')
       and grants.table_name = any(array[
           'admin_user_actions',
           'article_quota_settings',
           'billing_customers',
           'billing_events',
           'commerce_sales_settings',
           'knowledge_candidate_decisions',
           'knowledge_candidate_signals',
           'pwa_invite_redemptions',
           'pwa_invites'
       ]::text[]);

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_DATA_INTERNAL_TABLE_GRANT',
            'Browser roles have a direct privilege on an RPC-only internal table.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Every browser-readable user-data table must keep an ownership predicate.
    select count(*)::integer
      into violation_count
      from (values
          ('profiles', 'profiles_select_self_or_admin'),
          ('articles', 'articles_select_own_active'),
          ('article_workspaces', 'article_workspaces_select_own_active'),
          ('article_assets', 'article_assets_select_own_active'),
          ('user_entitlements', 'user_entitlements_select_own'),
          ('billing_checkout_sessions', 'billing_checkout_sessions_select_own'),
          ('billing_subscriptions', 'billing_subscriptions_select_own'),
          ('user_writing_profiles', 'user_writing_profiles_select_own_active')
      ) as required(table_name, policy_name)
     where not exists (
         select 1
           from pg_catalog.pg_policies policy
          where policy.schemaname = 'public'
            and policy.tablename = required.table_name
            and policy.policyname = required.policy_name
            and policy.cmd = 'SELECT'
            and 'authenticated'::name = any(policy.roles)
            and position('auth.uid' in coalesce(policy.qual, '')) > 0
     );

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_DATA_OWNER_POLICY_MISSING',
            'A browser-readable user-data table is missing its auth.uid ownership SELECT policy.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Writable browser tables must prevent ownership reassignment. UPDATE must
    -- protect both the existing row (USING) and the resulting row (WITH CHECK).
    select count(*)::integer
      into violation_count
      from (values
          ('profiles', 'profiles_update_own_display_name')
      ) as required(table_name, policy_name)
     where not exists (
         select 1
           from pg_catalog.pg_policies policy
          where policy.schemaname = 'public'
            and policy.tablename = required.table_name
            and policy.policyname = required.policy_name
            and policy.cmd = 'UPDATE'
            and 'authenticated'::name = any(policy.roles)
            and position('auth.uid' in coalesce(policy.qual, '')) > 0
            and position('auth.uid' in coalesce(policy.with_check, '')) > 0
     );

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_PROFILE_WRITE_POLICY_WEAK',
            'Profile update policy no longer protects both current and resulting ownership.',
            'user-data-isolation', null, null, null
        );
    end if;

    select count(*)::integer
      into violation_count
      from (values
          ('user_writing_profiles', 'user_writing_profiles_insert_own_active', 'INSERT'),
          ('user_writing_profiles', 'user_writing_profiles_update_own_active', 'UPDATE'),
          ('user_writing_profiles', 'user_writing_profiles_delete_own_active', 'DELETE')
      ) as required(table_name, policy_name, command_name)
     where not exists (
         select 1
           from pg_catalog.pg_policies policy
          where policy.schemaname = 'public'
            and policy.tablename = required.table_name
            and policy.policyname = required.policy_name
            and policy.cmd = required.command_name
            and 'authenticated'::name = any(policy.roles)
            and case required.command_name
                when 'INSERT' then position('auth.uid' in coalesce(policy.with_check, '')) > 0
                when 'UPDATE' then position('auth.uid' in coalesce(policy.qual, '')) > 0
                                   and position('auth.uid' in coalesce(policy.with_check, '')) > 0
                when 'DELETE' then position('auth.uid' in coalesce(policy.qual, '')) > 0
                else false
            end
     );

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_WRITING_PROFILE_POLICY_WEAK',
            'Writing-profile write policy no longer enforces auth.uid ownership.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Storage objects are visible only when an exact metadata row owned by the
    -- current auth.uid authorizes the same bucket/path lifecycle state.
    select count(*)::integer
      into violation_count
      from pg_catalog.pg_policies policy
     where policy.schemaname = 'storage'
       and policy.tablename = 'objects'
       and policy.policyname = any(array[
           'article_assets_storage_insert_prepared',
           'article_assets_storage_select_ready',
           'article_assets_storage_select_delete_pending',
           'article_assets_storage_delete_pending'
       ]::text[])
       and position('auth.uid' in coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')) > 0
       and position('article_assets' in coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')) > 0
       and position('article-assets' in coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')) > 0;

    if violation_count <> 4 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_DATA_STORAGE_POLICY_WEAK',
            'Article Storage policies no longer enforce exact auth.uid-owned metadata isolation.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Authorization must never trust user-editable JWT metadata.
    select count(*)::integer
      into violation_count
      from pg_catalog.pg_policies policy
     where policy.schemaname in ('public', 'storage')
       and lower(coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, ''))
           ~ '(raw_user_meta_data|user_metadata)';

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_METADATA_AUTHORIZATION',
            'An RLS policy references user-editable metadata for authorization.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Also catch SECURITY DEFINER code that appears to derive role/status/admin
    -- or entitlement authorization from raw_user_meta_data. Benign signup
    -- profile fields such as display_name are intentionally not rejected.
    select count(*)::integer
      into violation_count
      from pg_catalog.pg_proc function
      join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
     where namespace.nspname in ('public', 'private')
       and function.prokind = 'f'
       and function.prosecdef
       and lower(pg_catalog.pg_get_functiondef(function.oid))
           ~ 'raw_user_meta_data[^;]{0,240}(role|status|admin|entitlement|product)';

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'USER_METADATA_PRIVILEGE_AUTHORIZATION',
            'SECURITY DEFINER code appears to use user-editable metadata for privilege authorization.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Views in exposed public schema must invoke caller permissions so they do
    -- not silently bypass table RLS.
    select count(*)::integer
      into violation_count
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relkind = 'v'
       and not ('security_invoker=true' = any(coalesce(relation.reloptions, array[]::text[])));

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'PUBLIC_VIEW_BYPASSES_RLS',
            'A public view is not configured with security_invoker=true.',
            'user-data-isolation', null, null, null
        );
    end if;

    -- Admin RPCs remain callable from the authenticated client only because
    -- they perform an authoritative active-admin check inside the function.
    select count(*)::integer
      into violation_count
      from pg_catalog.pg_proc function
      join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
     where namespace.nspname = 'public'
       and function.prokind = 'f'
       and function.prosecdef
       and function.proname like 'admin\_%' escape '\'
       and pg_catalog.has_function_privilege('authenticated', function.oid, 'EXECUTE')
       and position('private.is_active_admin' in pg_catalog.pg_get_functiondef(function.oid)) = 0;

    if violation_count > 0 then
        issue_count := issue_count + 1;
        perform private.ops_upsert_event(
            'security', 'critical', 'isolation-audit', 'ADMIN_RPC_AUTHORIZATION_MISSING',
            'An authenticated SECURITY DEFINER admin RPC is missing its active-admin authorization check.',
            'user-data-isolation', null, null, null
        );
    end if;

    if issue_count > 0 then
        perform private.ops_set_health(
            'user-data-isolation',
            'error',
            format('ユーザーデータ分離監査で %s 件の契約違反を検出しました。', issue_count)
        );
        return false;
    end if;

    perform private.ops_set_health(
        'user-data-isolation',
        'healthy',
        '本人所有RLS・Storage分離・管理RPC境界は正常です。'
    );

    update public.ops_events
       set status = 'resolved',
           resolved_at = now(),
           resolved_by = null,
           resolution_note = 'Automated user-data isolation audit passed.',
           updated_at = now()
     where source = 'isolation-audit'
       and error_code like 'USER\_%' escape '\'
       and status <> 'resolved';

    return true;
exception when others then
    perform private.ops_set_health(
        'user-data-isolation',
        'error',
        'ユーザーデータ分離監査自体の実行に失敗しました。'
    );
    perform private.ops_upsert_event(
        'security', 'critical', 'isolation-audit', 'USER_DATA_ISOLATION_AUDIT_FAILED',
        'User-data isolation audit execution failed.',
        'user-data-isolation', null, null, null
    );
    return false;
end;
$function$;

revoke all on function private.ops_run_user_data_isolation_audit() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $block$
declare
    existing_job bigint;
begin
    select jobid
      into existing_job
      from cron.job
     where jobname = 'aas-user-data-isolation-audit-hourly'
     limit 1;

    if existing_job is not null then
        perform cron.unschedule(existing_job);
    end if;
end;
$block$;

select cron.schedule(
    'aas-user-data-isolation-audit-hourly',
    '7 * * * *',
    $cron$select private.ops_run_user_data_isolation_audit();$cron$
);

select private.ops_run_user_data_isolation_audit();

commit;
