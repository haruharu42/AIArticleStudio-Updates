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
create index ops_events_status_last_seen_idx on public.ops_events(status,last_seen_at desc);
create index ops_events_severity_last_seen_idx on public.ops_events(severity,last_seen_at desc);
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
create index ops_audit_findings_run_idx on public.ops_audit_findings(run_id,severity,created_at);

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

create policy ops_events_deny_direct on public.ops_events for all to anon,authenticated using(false) with check(false);
create policy ops_audit_runs_deny_direct on public.ops_audit_runs for all to anon,authenticated using(false) with check(false);
create policy ops_audit_findings_deny_direct on public.ops_audit_findings for all to anon,authenticated using(false) with check(false);
create policy ops_health_checks_deny_direct on public.ops_health_checks for all to anon,authenticated using(false) with check(false);

revoke all on table public.ops_events from public,anon,authenticated;
revoke all on table public.ops_audit_runs from public,anon,authenticated;
revoke all on table public.ops_audit_findings from public,anon,authenticated;
revoke all on table public.ops_health_checks from public,anon,authenticated;

create or replace function private.ops_sanitize_text(p_value text,p_max_length integer default 500)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $function$
declare
    v text := coalesce(p_value,'');
    m integer := greatest(1,least(coalesce(p_max_length,500),2000));
begin
    v := regexp_replace(v,'sb_secret_[A-Za-z0-9_-]+','[REDACTED]','gi');
    v := regexp_replace(v,'sk_(live|test)_[A-Za-z0-9_-]+','[REDACTED]','gi');
    v := regexp_replace(v,'whsec_[A-Za-z0-9_-]+','[REDACTED]','gi');
    v := regexp_replace(v,'Bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*','Bearer [REDACTED]','gi');
    v := regexp_replace(v,'eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+','[REDACTED_JWT]','g');
    v := regexp_replace(v,'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}','[EMAIL]','g');
    v := regexp_replace(v,'[\r\n\t]+',' ','g');
    return left(trim(v),m);
end;
$function$;
revoke all on function private.ops_sanitize_text(text,integer) from public,anon,authenticated;

create or replace function private.ops_upsert_event(
    p_event_kind text,p_severity text,p_source text,p_error_code text,p_message text,
    p_feature text default null,p_route text default null,p_request_id text default null,p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
    v_kind text := lower(coalesce(p_event_kind,'error'));
    v_severity text := lower(coalesce(p_severity,'error'));
    v_source text;
    v_code text;
    v_feature text;
    v_route text;
    v_request text;
    v_message text;
    v_fingerprint text;
    v_id uuid;
begin
    if v_kind not in ('error','security','warning','health') then v_kind:='error'; end if;
    if v_severity not in ('info','warning','error','critical') then v_severity:='error'; end if;
    v_source := left(regexp_replace(lower(coalesce(p_source,'unknown')),'[^a-z0-9_.:-]+','-','g'),60);
    if v_source='' then v_source:='unknown'; end if;
    v_code := left(regexp_replace(upper(coalesce(p_error_code,'UNKNOWN_ERROR')),'[^A-Z0-9_.:-]+','_','g'),80);
    if v_code='' then v_code:='UNKNOWN_ERROR'; end if;
    v_feature := nullif(left(regexp_replace(lower(coalesce(p_feature,'')),'[^a-z0-9_.:-]+','-','g'),80),'');
    v_route := nullif(left(split_part(coalesce(p_route,''),'?',1),160),'');
    v_request := nullif(private.ops_sanitize_text(p_request_id,120),'');
    v_message := private.ops_sanitize_text(coalesce(p_message,'Unexpected error'),700);
    if v_message='' then v_message:='Unexpected error'; end if;
    v_fingerprint := md5(concat_ws('|',v_kind,v_source,v_code,coalesce(v_feature,''),coalesce(v_route,'')));

    insert into public.ops_events(fingerprint,event_kind,severity,source,error_code,message,feature,route,request_id,last_user_id)
    values(v_fingerprint,v_kind,v_severity,v_source,v_code,v_message,v_feature,v_route,v_request,p_user_id)
    on conflict(fingerprint) do update set
      severity=case
        when public.ops_events.severity='critical' or excluded.severity='critical' then 'critical'
        when public.ops_events.severity='error' or excluded.severity='error' then 'error'
        when public.ops_events.severity='warning' or excluded.severity='warning' then 'warning'
        else 'info' end,
      message=excluded.message,
      request_id=coalesce(excluded.request_id,public.ops_events.request_id),
      last_user_id=coalesce(excluded.last_user_id,public.ops_events.last_user_id),
      last_seen_at=now(),
      occurrence_count=public.ops_events.occurrence_count+1,
      status=case when public.ops_events.status='resolved' then 'open' else public.ops_events.status end,
      resolved_at=case when public.ops_events.status='resolved' then null else public.ops_events.resolved_at end,
      resolved_by=case when public.ops_events.status='resolved' then null else public.ops_events.resolved_by end,
      resolution_note=case when public.ops_events.status='resolved' then null else public.ops_events.resolution_note end,
      updated_at=now()
    returning id into v_id;
    return v_id;
end;
$function$;
revoke all on function private.ops_upsert_event(text,text,text,text,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.record_client_error(
    p_error_code text,p_message text,p_feature text default null,p_route text default null,p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
    v_user uuid := (select auth.uid());
    v_code text;
    v_recent integer;
begin
    if v_user is null or not exists(select 1 from public.profiles p where p.id=v_user) then return false; end if;
    v_code := upper(coalesce(trim(p_error_code),'CLIENT_ERROR'));
    if v_code !~ '^[A-Z0-9_.:-]{1,80}$' then v_code:='CLIENT_ERROR'; end if;
    select count(*)::integer into v_recent from public.ops_events e
      where e.last_user_id=v_user and e.last_seen_at>now()-interval '1 minute';
    if v_recent>=20 then return false; end if;
    perform private.ops_upsert_event('error','error','pwa-client',v_code,p_message,p_feature,p_route,p_request_id,v_user);
    return true;
end;
$function$;
revoke all on function public.record_client_error(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_client_error(text,text,text,text,text) to authenticated;

create or replace function public.ops_record_system_event(
    p_event_kind text,p_severity text,p_source text,p_error_code text,p_message text,
    p_feature text default null,p_route text default null,p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
    perform private.ops_upsert_event(p_event_kind,p_severity,p_source,p_error_code,p_message,p_feature,p_route,p_request_id,null);
    return true;
end;
$function$;
revoke all on function public.ops_record_system_event(text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ops_record_system_event(text,text,text,text,text,text,text,text) to service_role;

create or replace function private.ops_add_finding(
    p_run_id uuid,p_check_code text,p_severity text,p_category text,p_title text,p_detail text,
    p_object_name text default null,p_remediation text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
    insert into public.ops_audit_findings(run_id,check_code,severity,category,title,detail,object_name,remediation)
    values(p_run_id,left(p_check_code,80),p_severity,left(p_category,80),private.ops_sanitize_text(p_title,200),
      private.ops_sanitize_text(p_detail,700),nullif(private.ops_sanitize_text(p_object_name,160),''),
      nullif(private.ops_sanitize_text(p_remediation,400),''));
end;
$function$;
revoke all on function private.ops_add_finding(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;

create or replace function private.ops_set_health(p_component text,p_status text,p_message text)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
    insert into public.ops_health_checks(component,status,message,checked_at)
    values(left(p_component,80),p_status,private.ops_sanitize_text(p_message,300),now())
    on conflict(component) do update set status=excluded.status,message=excluded.message,checked_at=excluded.checked_at;
end;
$function$;
revoke all on function private.ops_set_health(text,text,text) from public,anon,authenticated;

create or replace function private.ops_run_database_audit(p_source text default 'system')
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
    v_run_id uuid;
    v_source text := lower(coalesce(p_source,'system'));
    r record;
    v_critical integer := 0;
    v_error integer := 0;
    v_warning integer := 0;
    v_info integer := 0;
    v_scheduler_ok boolean := false;
    v_storage_ok boolean := true;
    v_bucket_count integer := 0;
    v_policy_count integer := 0;
begin
    if v_source not in ('scheduled','manual','installation','system') then v_source:='system'; end if;
    insert into public.ops_audit_runs(source,status) values(v_source,'running') returning id into v_run_id;

    for r in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)
    loop
      perform private.ops_add_finding(v_run_id,'DB_RLS_FORCE','critical','database','RLS保護が不足しています',
        'publicテーブルでRLSまたはFORCE RLSが無効です。',r.relname,'RLSとFORCE RLSを有効化してください。');
    end loop;

    for r in select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) args
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    loop
      perform private.ops_add_finding(v_run_id,'ANON_RPC_EXECUTE','critical','database','匿名RPC実行権を検出しました',
        'anonロールからpublic RPCを実行できます。',r.proname||'('||r.args||')','意図しない場合はEXECUTE権限を取り消してください。');
    end loop;

    for r in select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) args
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prosecdef
        and not exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) cfg where cfg like 'search_path=%')
    loop
      perform private.ops_add_finding(v_run_id,'SECDEF_SEARCH_PATH','error','database','SECURITY DEFINERのsearch_path固定不足',
        'SECURITY DEFINER関数でsearch_pathが固定されていません。',r.proname||'('||r.args||')','SET search_path = '''' を設定してください。');
    end loop;

    for r in select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) args
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'billing\_%' escape '\'
        and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    loop
      perform private.ops_add_finding(v_run_id,'BILLING_AUTH_EXECUTE','critical','billing','決済RPCの一般実行権を検出しました',
        'billing系RPCをauthenticatedロールから直接実行できます。',r.proname||'('||r.args||')','service_role専用へ戻してください。');
    end loop;

    if to_regclass('storage.buckets') is null then
      v_storage_ok:=false;
      perform private.ops_add_finding(v_run_id,'STORAGE_BUCKET_TABLE','error','storage','Storage設定を確認できません',
        'storage.bucketsが見つかりません。',null,'Supabase Storage状態を確認してください。');
    else
      select count(*)::integer into v_bucket_count from storage.buckets b
       where b.id='article-assets' and b.public=false and b.file_size_limit=10485760
         and b.allowed_mime_types @> array['image/png','image/jpeg','image/webp']::text[];
      if v_bucket_count<>1 then
        v_storage_ok:=false;
        perform private.ops_add_finding(v_run_id,'ARTICLE_BUCKET_CONFIG','error','storage','記事画像Storage設定に差異があります',
          'article-assetsのprivate/10MiB/MIME制限が期待値と一致しません。','article-assets','Storage bucket設定を確認してください。');
      end if;
      select count(*)::integer into v_policy_count from pg_catalog.pg_policies
       where schemaname='storage' and tablename='objects' and policyname like 'article_assets_storage_%';
      if v_policy_count<4 then
        v_storage_ok:=false;
        perform private.ops_add_finding(v_run_id,'ARTICLE_STORAGE_POLICIES','critical','storage','記事画像Storageポリシーが不足しています',
          'article-assets向けStorageポリシーが期待数を下回っています。','storage.objects','Storage RLSポリシーを確認してください。');
      end if;
    end if;

    if to_regclass('cron.job') is not null then
      execute 'select exists(select 1 from cron.job where jobname=$1 and active=true)' into v_scheduler_ok using 'aas-ops-security-audit-hourly';
    end if;
    if not v_scheduler_ok then
      perform private.ops_add_finding(v_run_id,'AUDIT_SCHEDULER','warning','scheduler','定期監査スケジュールが無効です',
        '1時間ごとのSecurity & Operations監査ジョブを確認できません。','aas-ops-security-audit-hourly','pg_cronジョブを有効化してください。');
    end if;

    select count(*) filter(where severity='critical')::integer,
           count(*) filter(where severity='error')::integer,
           count(*) filter(where severity='warning')::integer,
           count(*) filter(where severity='info')::integer
      into v_critical,v_error,v_warning,v_info
      from public.ops_audit_findings f where f.run_id=v_run_id;

    update public.ops_audit_runs set
      status=case when v_critical>0 or v_error>0 then 'failed' when v_warning>0 then 'warning' else 'passed' end,
      critical_count=v_critical,error_count=v_error,warning_count=v_warning,info_count=v_info,completed_at=now()
      where id=v_run_id;

    perform private.ops_set_health('database-security',
      case when v_critical>0 or v_error>0 then 'error' when v_warning>0 then 'warning' else 'healthy' end,
      format('監査結果: Critical %s / Error %s / Warning %s',v_critical,v_error,v_warning));
    perform private.ops_set_health('storage',case when v_storage_ok then 'healthy' else 'error' end,
      case when v_storage_ok then 'article-assets設定は正常です。' else 'article-assets設定に確認事項があります。' end);
    perform private.ops_set_health('scheduler',case when v_scheduler_ok then 'healthy' else 'warning' end,
      case when v_scheduler_ok then '1時間ごとの定期監査が有効です。' else '定期監査ジョブを確認できません。' end);

    delete from public.ops_events where status='resolved' and last_seen_at<now()-interval '90 days';
    delete from public.ops_audit_runs where started_at<now()-interval '90 days';
    return v_run_id;
exception when others then
    if v_run_id is not null then update public.ops_audit_runs set status='failed',error_count=greatest(error_count,1),completed_at=now() where id=v_run_id; end if;
    perform private.ops_upsert_event('error','error','database-audit','AUDIT_EXECUTION_FAILED','定期セキュリティ監査の実行に失敗しました。','security-audit',null,null,null);
    return v_run_id;
end;
$function$;
revoke all on function private.ops_run_database_audit(text) from public,anon,authenticated;

create or replace function public.admin_ops_run_security_audit()
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then raise exception 'active admin required' using errcode='42501'; end if;
  return private.ops_run_database_audit('manual');
end;
$function$;
revoke all on function public.admin_ops_run_security_audit() from public,anon,authenticated;
grant execute on function public.admin_ops_run_security_audit() to authenticated;

create or replace function public.admin_ops_set_event_status(p_event_id uuid,p_status text,p_resolution_note text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_status text:=lower(coalesce(p_status,'')); v_admin uuid:=(select auth.uid());
begin
  if v_admin is null or not (select private.is_active_admin()) then raise exception 'active admin required' using errcode='42501'; end if;
  if v_status not in ('open','acknowledged','resolved') then raise exception 'invalid event status' using errcode='22023'; end if;
  update public.ops_events set status=v_status,
    resolved_at=case when v_status='resolved' then now() else null end,
    resolved_by=case when v_status='resolved' then v_admin else null end,
    resolution_note=case when v_status='resolved' then nullif(private.ops_sanitize_text(p_resolution_note,500),'') else null end,
    updated_at=now() where id=p_event_id;
  return found;
end;
$function$;
revoke all on function public.admin_ops_set_event_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_ops_set_event_status(uuid,text,text) to authenticated;

create or replace function public.admin_ops_get_snapshot(p_limit integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(10,least(coalesce(p_limit,80),200));
  v_counts jsonb; v_events jsonb; v_health jsonb; v_runs jsonb; v_findings jsonb; v_latest uuid;
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then raise exception 'active admin required' using errcode='42501'; end if;
  select jsonb_build_object('open',count(*) filter(where status<>'resolved'),'critical',count(*) filter(where status<>'resolved' and severity='critical'),
    'error',count(*) filter(where status<>'resolved' and severity='error'),'warning',count(*) filter(where status<>'resolved' and severity='warning'))
    into v_counts from public.ops_events;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_events from (
    select e.id,e.event_kind,e.severity,e.source,e.error_code,e.message,e.feature,e.route,e.request_id,p.aas_user_id as last_aas_user_id,
      e.status,e.first_seen_at,e.last_seen_at,e.occurrence_count,e.resolved_at,e.resolution_note
    from public.ops_events e left join public.profiles p on p.id=e.last_user_id
    order by case e.status when 'open' then 1 when 'acknowledged' then 2 else 3 end,
      case e.severity when 'critical' then 1 when 'error' then 2 when 'warning' then 3 else 4 end,e.last_seen_at desc limit v_limit) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.component),'[]'::jsonb) into v_health from (
    select component,status,message,checked_at,latency_ms from public.ops_health_checks) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]'::jsonb) into v_runs from (
    select id,source,status,critical_count,error_count,warning_count,info_count,started_at,completed_at from public.ops_audit_runs order by started_at desc limit 20) x;
  select id into v_latest from public.ops_audit_runs order by started_at desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb) into v_findings from (
    select id,run_id,check_code,severity,category,title,detail,object_name,remediation,created_at from public.ops_audit_findings where run_id=v_latest order by created_at) x;
  return jsonb_build_object('counts',v_counts,'events',v_events,'health',v_health,'runs',v_runs,'findings',v_findings);
end;
$function$;
revoke all on function public.admin_ops_get_snapshot(integer) from public,anon,authenticated;
grant execute on function public.admin_ops_get_snapshot(integer) to authenticated;

commit;
