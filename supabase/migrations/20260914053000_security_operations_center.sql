begin;

create table public.ops_events (
    id uuid primary key default gen_random_uuid(),
    fingerprint text not null unique,
    event_kind text not null check (event_kind in ('error','security','warning','health')),
    severity text not null check (severity in ('info','warning','error','critical')),
    source text not null,
    error_code text not null,
    message text not null,
    feature text,
    route text,
    request_id text,
    last_user_id uuid references public.profiles(id) on delete set null,
    status text not null default 'open' check (status in ('open','acknowledged','resolved')),
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    occurrence_count bigint not null default 1 check (occurrence_count > 0),
    resolved_at timestamptz,
    resolved_by uuid references public.profiles(id) on delete set null,
    resolution_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index ops_events_status_last_seen_idx on public.ops_events(status, last_seen_at desc);
create index ops_events_severity_last_seen_idx on public.ops_events(severity, last_seen_at desc);
create index ops_events_last_user_idx on public.ops_events(last_user_id) where last_user_id is not null;
create index ops_events_resolved_by_idx on public.ops_events(resolved_by) where resolved_by is not null;

create table public.ops_audit_runs (
    id uuid primary key default gen_random_uuid(),
    source text not null check (source in ('scheduled','manual','installation','system')),
    status text not null default 'running' check (status in ('running','passed','warning','failed')),
    critical_count integer not null default 0 check (critical_count >= 0),
    error_count integer not null default 0 check (error_count >= 0),
    warning_count integer not null default 0 check (warning_count >= 0),
    info_count integer not null default 0 check (info_count >= 0),
    started_at timestamptz not null default now(),
    completed_at timestamptz
);

create index ops_audit_runs_started_idx on public.ops_audit_runs(started_at desc);

create table public.ops_audit_findings (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.ops_audit_runs(id) on delete cascade,
    check_code text not null,
    severity text not null check (severity in ('info','warning','error','critical')),
    category text not null,
    title text not null,
    detail text not null,
    object_name text,
    remediation text,
    created_at timestamptz not null default now()
);

create index ops_audit_findings_run_idx on public.ops_audit_findings(run_id, severity, created_at);

create table public.ops_health_checks (
    component text primary key,
    status text not null check (status in ('healthy','warning','error','unknown')),
    message text not null,
    checked_at timestamptz not null default now(),
    latency_ms integer check (latency_ms is null or latency_ms >= 0)
);

alter table public.ops_events enable row level security;
alter table public.ops_events force row level security;
alter table public.ops_audit_runs enable row level security;
alter table public.ops_audit_runs force row level security;
alter table public.ops_audit_findings enable row level security;
alter table public.ops_audit_findings force row level security;
alter table public.ops_health_checks enable row level security;
alter table public.ops_health_checks force row level security;

create policy ops_events_deny_direct on public.ops_events for all to anon, authenticated using (false) with check (false);
create policy ops_audit_runs_deny_direct on public.ops_audit_runs for all to anon, authenticated using (false) with check (false);
create policy ops_audit_findings_deny_direct on public.ops_audit_findings for all to anon, authenticated using (false) with check (false);
create policy ops_health_checks_deny_direct on public.ops_health_checks for all to anon, authenticated using (false) with check (false);

revoke all on table public.ops_events from public, anon, authenticated;
revoke all on table public.ops_audit_runs from public, anon, authenticated;
revoke all on table public.ops_audit_findings from public, anon, authenticated;
revoke all on table public.ops_health_checks from public, anon, authenticated;

create or replace function private.ops_sanitize_text(p_value text, p_max_length integer default 500)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
    cleaned text := coalesce(p_value, '');
    max_length integer := greatest(1, least(coalesce(p_max_length, 500), 2000));
begin
    cleaned := regexp_replace(cleaned, 'sb_secret_[A-Za-z0-9_-]+', '[REDACTED]', 'gi');
    cleaned := regexp_replace(cleaned, 'sk_(live|test)_[A-Za-z0-9_-]+', '[REDACTED]', 'gi');
    cleaned := regexp_replace(cleaned, 'whsec_[A-Za-z0-9_-]+', '[REDACTED]', 'gi');
    cleaned := regexp_replace(cleaned, 'Bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*', 'Bearer [REDACTED]', 'gi');
    cleaned := regexp_replace(cleaned, 'eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+', '[REDACTED_JWT]', 'g');
    cleaned := regexp_replace(cleaned, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}', '[EMAIL]', 'g');
    cleaned := regexp_replace(cleaned, '[\r\n\t]+', ' ', 'g');
    return left(trim(cleaned), max_length);
end;
$function$;

revoke all on function private.ops_sanitize_text(text, integer) from public, anon, authenticated;

create or replace function private.ops_upsert_event(
    p_event_kind text,
    p_severity text,
    p_source text,
    p_error_code text,
    p_message text,
    p_feature text default null,
    p_route text default null,
    p_request_id text default null,
    p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
    normalized_kind text := lower(coalesce(p_event_kind, 'error'));
    normalized_severity text := lower(coalesce(p_severity, 'error'));
    normalized_source text;
    normalized_code text;
    normalized_feature text;
    normalized_route text;
    normalized_request text;
    normalized_message text;
    event_fingerprint text;
    event_id uuid;
begin
    if normalized_kind not in ('error','security','warning','health') then normalized_kind := 'error'; end if;
    if normalized_severity not in ('info','warning','error','critical') then normalized_severity := 'error'; end if;

    normalized_source := left(regexp_replace(lower(coalesce(p_source, 'unknown')), '[^a-z0-9_.:-]+', '-', 'g'), 60);
    if normalized_source = '' then normalized_source := 'unknown'; end if;
    normalized_code := left(regexp_replace(upper(coalesce(p_error_code, 'UNKNOWN_ERROR')), '[^A-Z0-9_.:-]+', '_', 'g'), 80);
    if normalized_code = '' then normalized_code := 'UNKNOWN_ERROR'; end if;
    normalized_feature := nullif(left(regexp_replace(lower(coalesce(p_feature, '')), '[^a-z0-9_.:-]+', '-', 'g'), 80), '');
    normalized_route := nullif(left(split_part(coalesce(p_route, ''), '?', 1), 160), '');
    normalized_request := nullif(public.private_ops_sanitize_placeholder(), '');
    normalized_request := nullif(private.ops_sanitize_text(p_request_id, 120), '');
    normalized_message := private.ops_sanitize_text(coalesce(p_message, 'Unexpected error'), 700);
    if normalized_message = '' then normalized_message := 'Unexpected error'; end if;

    event_fingerprint := md5(concat_ws('|', normalized_kind, normalized_source, normalized_code, coalesce(normalized_feature,''), coalesce(normalized_route,'')));

    insert into public.ops_events (
        fingerprint, event_kind, severity, source, error_code, message,
        feature, route, request_id, last_user_id
    ) values (
        event_fingerprint, normalized_kind, normalized_severity, normalized_source, normalized_code, normalized_message,
        normalized_feature, normalized_route, normalized_request, p_user_id
    )
    on conflict (fingerprint) do update set
        event_kind = excluded.event_kind,
        severity = case
            when public.ops_events.severity = 'critical' or excluded.severity = 'critical' then 'critical'
            when public.ops_events.severity = 'error' or excluded.severity = 'error' then 'error'
            when public.ops_events.severity = 'warning' or excluded.severity = 'warning' then 'warning'
            else 'info'
        end,
        message = excluded.message,
        request_id = coalesce(excluded.request_id, public.ops_events.request_id),
        last_user_id = coalesce(excluded.last_user_id, public.ops_events.last_user_id),
        last_seen_at = now(),
        occurrence_count = public.ops_events.occurrence_count + 1,
        status = case when public.ops_events.status = 'resolved' then 'open' else public.ops_events.status end,
        resolved_at = case when public.ops_events.status = 'resolved' then null else public.ops_events.resolved_at end,
        resolved_by = case when public.ops_events.status = 'resolved' then null else public.ops_events.resolved_by end,
        resolution_note = case when public.ops_events.status = 'resolved' then null else public.ops_events.resolution_note end,
        updated_at = now()
    returning id into event_id;

    return event_id;
end;
$function$;

-- Replace a temporary parser-safe placeholder in the function body above.
-- The helper is created only so migrations remain deterministic across Postgres versions.
create or replace function public.private_ops_sanitize_placeholder()
returns text
language sql
immutable
set search_path = ''
as $function$ select ''::text $function$;
revoke all on function public.private_ops_sanitize_placeholder() from public, anon, authenticated;

revoke all on function private.ops_upsert_event(text,text,text,text,text,text,text,text,uuid) from public, anon, authenticated;

create or replace function public.record_client_error(
    p_error_code text,
    p_message text,
    p_feature text default null,
    p_route text default null,
    p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    normalized_code text;
    recent_count integer;
begin
    if current_user_id is null then
        return false;
    end if;
    if not exists (select 1 from public.profiles p where p.id = current_user_id) then
        return false;
    end if;

    normalized_code := upper(coalesce(trim(p_error_code), 'CLIENT_ERROR'));
    if normalized_code !~ '^[A-Z0-9_.:-]{1,80}$' then normalized_code := 'CLIENT_ERROR'; end if;

    select count(*)::integer into recent_count
    from public.ops_events e
    where e.last_user_id = current_user_id
      and e.last_seen_at > now() - interval '1 minute';
    if recent_count >= 20 then
        return false;
    end if;

    perform private.ops_upsert_event(
        'error', 'error', 'pwa-client', normalized_code, p_message,
        p_feature, p_route, p_request_id, current_user_id
    );
    return true;
end;
$function$;

revoke all on function public.record_client_error(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_client_error(text,text,text,text,text) to authenticated;

create or replace function public.ops_record_system_event(
    p_event_kind text,
    p_severity text,
    p_source text,
    p_error_code text,
    p_message text,
    p_feature text default null,
    p_route text default null,
    p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
    perform private.ops_upsert_event(
        p_event_kind, p_severity, p_source, p_error_code, p_message,
        p_feature, p_route, p_request_id, null
    );
    return true;
end;
$function$;

revoke all on function public.ops_record_system_event(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.ops_record_system_event(text,text,text,text,text,text,text,text) to service_role;

create or replace function private.ops_add_finding(
    p_run_id uuid,
    p_check_code text,
    p_severity text,
    p_category text,
    p_title text,
    p_detail text,
    p_object_name text default null,
    p_remediation text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    insert into public.ops_audit_findings(run_id,check_code,severity,category,title,detail,object_name,remediation)
    values (
        p_run_id,
        left(p_check_code,80),
        p_severity,
        left(p_category,80),
        private.ops_sanitize_text(p_title,200),
        private.ops_sanitize_text(p_detail,700),
        nullif(private.ops_sanitize_text(p_object_name,160),''),
        nullif(private.ops_sanitize_text(p_remediation,400),'')
    );
end;
$function$;
revoke all on function private.ops_add_finding(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;

create or replace function private.ops_set_health(p_component text, p_status text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    insert into public.ops_health_checks(component,status,message,checked_at)
    values (left(p_component,80), p_status, private.ops_sanitize_text(p_message,300), now())
    on conflict(component) do update set status=excluded.status,message=excluded.message,checked_at=excluded.checked_at;
end;
$function$;
revoke all on function private.ops_set_health(text,text,text) from public, anon, authenticated;

create or replace function private.ops_run_database_audit(p_source text default 'system')
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
    run_id uuid;
    source_value text := lower(coalesce(p_source,'system'));
    rec record;
    critical_count integer;
    error_count integer;
    warning_count integer;
    info_count integer;
    scheduler_ok boolean := false;
    storage_ok boolean := true;
    bucket_count integer := 0;
    storage_policy_count integer := 0;
begin
    if source_value not in ('scheduled','manual','installation','system') then source_value := 'system'; end if;
    insert into public.ops_audit_runs(source,status) values(source_value,'running') returning id into run_id;

    for rec in
        select c.relname
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)
    loop
        perform private.ops_add_finding(run_id,'DB_RLS_FORCE','critical','database','RLS保護が不足しています',
            'publicテーブルでRLSまたはFORCE RLSが無効です。',rec.relname,'RLSとFORCE RLSを有効化してください。');
    end loop;

    for rec in
        select p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) args
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    loop
        perform private.ops_add_finding(run_id,'ANON_RPC_EXECUTE','critical','database','匿名RPC実行権を検出しました',
            'anonロールからpublic RPCを実行できます。',rec.proname || '(' || rec.args || ')','意図しない場合はEXECUTE権限を取り消してください。');
    end loop;

    for rec in
        select p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) args
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private')
          and p.prosecdef
          and not exists (
              select 1 from unnest(coalesce(p.proconfig,array[]::text[])) cfg where cfg like 'search_path=%'
          )
    loop
        perform private.ops_add_finding(run_id,'SECDEF_SEARCH_PATH','error','database','SECURITY DEFINERのsearch_path固定不足',
            'SECURITY DEFINER関数でsearch_pathが固定されていません。',rec.proname || '(' || rec.args || ')','SET search_path = '''' を設定してください。');
    end loop;

    for rec in
        select p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) args
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'billing\_%' escape '\'
          and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    loop
        perform private.ops_add_finding(run_id,'BILLING_AUTH_EXECUTE','critical','billing','決済RPCの一般実行権を検出しました',
            'billing系RPCをauthenticatedロールから直接実行できます。',rec.proname || '(' || rec.args || ')','service_role専用へ戻してください。');
    end loop;

    if to_regclass('storage.buckets') is null then
        storage_ok := false;
        perform private.ops_add_finding(run_id,'STORAGE_BUCKET_TABLE','error','storage','Storage設定を確認できません',
            'storage.bucketsが見つかりません。',null,'Supabase Storage状態を確認してください。');
    else
        select count(*)::integer into bucket_count
        from storage.buckets b
        where b.id='article-assets' and b.public=false and b.file_size_limit=10485760
          and b.allowed_mime_types @> array['image/png','image/jpeg','image/webp']::text[];
        if bucket_count <> 1 then
            storage_ok := false;
            perform private.ops_add_finding(run_id,'ARTICLE_BUCKET_CONFIG','error','storage','記事画像Storage設定に差異があります',
                'article-assetsのprivate/10MiB/MIME制限が期待値と一致しません。','article-assets','Storage bucket設定を確認してください。');
        end if;

        select count(*)::integer into storage_policy_count
        from pg_catalog.pg_policies
        where schemaname='storage' and tablename='objects' and policyname like 'article_assets_storage_%';
        if storage_policy_count < 4 then
            storage_ok := false;
            perform private.ops_add_finding(run_id,'ARTICLE_STORAGE_POLICIES','critical','storage','記事画像Storageポリシーが不足しています',
                'article-assets向けStorageポリシーが期待数を下回っています。','storage.objects','Storage RLSポリシーを確認してください。');
        end if;
    end if;

    if to_regclass('cron.job') is not null then
        execute 'select exists(select 1 from cron.job where jobname = $1 and active is true)'
          into scheduler_ok using 'aas-ops-security-audit-hourly';
    end if;
    if not scheduler_ok then
        perform private.ops_add_finding(run_id,'AUDIT_SCHEDULER','warning','scheduler','定期監査スケジュールが無効です',
            '1時間ごとのSecurity & Operations監査ジョブを確認できません。','aas-ops-security-audit-hourly','pg_cronジョブを有効化してください。');
    end if;

    select
      count(*) filter(where severity='critical')::integer,
      count(*) filter(where severity='error')::integer,
      count(*) filter(where severity='warning')::integer,
      count(*) filter(where severity='info')::integer
    into critical_count,error_count,warning_count,info_count
    from public.ops_audit_findings where run_id=private.ops_run_database_audit.run_id;

    update public.ops_audit_runs
    set status=case when critical_count>0 or error_count>0 then 'failed' when warning_count>0 then 'warning' else 'passed' end,
        critical_count=critical_count,error_count=error_count,warning_count=warning_count,info_count=info_count,
        completed_at=now()
    where id=run_id;

    perform private.ops_set_health('database-security',
        case when critical_count>0 or error_count>0 then 'error' when warning_count>0 then 'warning' else 'healthy' end,
        format('監査結果: Critical %s / Error %s / Warning %s',critical_count,error_count,warning_count));
    perform private.ops_set_health('storage',case when storage_ok then 'healthy' else 'error' end,
        case when storage_ok then 'article-assets設定は正常です。' else 'article-assets設定に確認事項があります。' end);
    perform private.ops_set_health('scheduler',case when scheduler_ok then 'healthy' else 'warning' end,
        case when scheduler_ok then '1時間ごとの定期監査が有効です。' else '定期監査ジョブを確認できません。' end);

    delete from public.ops_events where status='resolved' and last_seen_at < now()-interval '90 days';
    delete from public.ops_audit_runs where started_at < now()-interval '90 days';

    return run_id;
exception when others then
    if run_id is not null then
        update public.ops_audit_runs set status='failed',error_count=greatest(error_count,1),completed_at=now() where id=run_id;
    end if;
    perform private.ops_upsert_event('error','error','database-audit','AUDIT_EXECUTION_FAILED','定期セキュリティ監査の実行に失敗しました。','security-audit',null,null,null);
    return run_id;
end;
$function$;

revoke all on function private.ops_run_database_audit(text) from public, anon, authenticated;

create or replace function public.admin_ops_run_security_audit()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode='42501';
    end if;
    return private.ops_run_database_audit('manual');
end;
$function$;
revoke all on function public.admin_ops_run_security_audit() from public, anon, authenticated;
grant execute on function public.admin_ops_run_security_audit() to authenticated;

create or replace function public.admin_ops_set_event_status(p_event_id uuid,p_status text,p_resolution_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    normalized_status text := lower(coalesce(p_status,''));
    current_admin uuid := (select auth.uid());
begin
    if current_admin is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode='42501';
    end if;
    if normalized_status not in ('open','acknowledged','resolved') then
        raise exception 'invalid event status' using errcode='22023';
    end if;
    update public.ops_events
    set status=normalized_status,
        resolved_at=case when normalized_status='resolved' then now() else null end,
        resolved_by=case when normalized_status='resolved' then current_admin else null end,
        resolution_note=case when normalized_status='resolved' then nullif(private.ops_sanitize_text(p_resolution_note,500),'') else null end,
        updated_at=now()
    where id=p_event_id;
    return found;
end;
$function$;
revoke all on function public.admin_ops_set_event_status(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_ops_set_event_status(uuid,text,text) to authenticated;

create or replace function public.admin_ops_get_snapshot(p_limit integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    bounded_limit integer := greatest(10,least(coalesce(p_limit,80),200));
    counts_json jsonb;
    events_json jsonb;
    health_json jsonb;
    runs_json jsonb;
    findings_json jsonb;
    latest_run_id uuid;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode='42501';
    end if;

    select jsonb_build_object(
      'open',count(*) filter(where status<>'resolved'),
      'critical',count(*) filter(where status<>'resolved' and severity='critical'),
      'error',count(*) filter(where status<>'resolved' and severity='error'),
      'warning',count(*) filter(where status<>'resolved' and severity='warning')
    ) into counts_json from public.ops_events;

    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into events_json from (
      select e.id,e.event_kind,e.severity,e.source,e.error_code,e.message,e.feature,e.route,e.request_id,
             p.aas_user_id as last_aas_user_id,e.status,e.first_seen_at,e.last_seen_at,e.occurrence_count,e.resolved_at,e.resolution_note
      from public.ops_events e left join public.profiles p on p.id=e.last_user_id
      order by case e.status when 'open' then 1 when 'acknowledged' then 2 else 3 end,
               case e.severity when 'critical' then 1 when 'error' then 2 when 'warning' then 3 else 4 end,
               e.last_seen_at desc
      limit bounded_limit
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.component),'[]'::jsonb) into health_json from (
      select component,status,message,checked_at,latency_ms from public.ops_health_checks
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]'::jsonb) into runs_json from (
      select id,source,status,critical_count,error_count,warning_count,info_count,started_at,completed_at
      from public.ops_audit_runs order by started_at desc limit 20
    ) x;

    select id into latest_run_id from public.ops_audit_runs order by started_at desc limit 1;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb) into findings_json from (
      select id,run_id,check_code,severity,category,title,detail,object_name,remediation,created_at
      from public.ops_audit_findings where run_id=latest_run_id order by created_at
    ) x;

    return jsonb_build_object('counts',counts_json,'events',events_json,'health',health_json,'runs',runs_json,'findings',findings_json);
end;
$function$;
revoke all on function public.admin_ops_get_snapshot(integer) from public, anon, authenticated;
grant execute on function public.admin_ops_get_snapshot(integer) to authenticated;

commit;
