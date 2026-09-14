begin;

create table public.ops_capacity_settings (
    singleton boolean primary key default true check (singleton = true),
    plan_label text not null default '未設定',
    database_limit_bytes bigint check (database_limit_bytes is null or database_limit_bytes > 0),
    storage_limit_bytes bigint check (storage_limit_bytes is null or storage_limit_bytes > 0),
    warning_percent integer not null default 70 check (warning_percent between 1 and 99),
    danger_percent integer not null default 85 check (danger_percent between 2 and 99),
    critical_percent integer not null default 95 check (critical_percent between 3 and 100),
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint ops_capacity_threshold_order check (warning_percent < danger_percent and danger_percent < critical_percent)
);

alter table public.ops_capacity_settings enable row level security;
alter table public.ops_capacity_settings force row level security;
create policy ops_capacity_settings_deny_direct on public.ops_capacity_settings
for all to anon, authenticated using (false) with check (false);
revoke all on table public.ops_capacity_settings from public, anon, authenticated;

insert into public.ops_capacity_settings(singleton) values(true) on conflict(singleton) do nothing;

create or replace function private.ops_capacity_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_settings public.ops_capacity_settings%rowtype;
  v_db_used bigint := 0;
  v_storage_used bigint := 0;
  v_storage_count bigint := 0;
  v_db_percent numeric := null;
  v_storage_percent numeric := null;
begin
  select * into v_settings from public.ops_capacity_settings where singleton=true;
  v_db_used := pg_catalog.pg_database_size(pg_catalog.current_database());

  if pg_catalog.to_regclass('storage.objects') is not null then
    execute $sql$
      select
        coalesce(sum(case when coalesce(metadata->>'size','') ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0)::bigint,
        count(*)::bigint
      from storage.objects
    $sql$ into v_storage_used, v_storage_count;
  end if;

  if v_settings.database_limit_bytes is not null and v_settings.database_limit_bytes > 0 then
    v_db_percent := round((v_db_used::numeric / v_settings.database_limit_bytes::numeric) * 100, 1);
  end if;
  if v_settings.storage_limit_bytes is not null and v_settings.storage_limit_bytes > 0 then
    v_storage_percent := round((v_storage_used::numeric / v_settings.storage_limit_bytes::numeric) * 100, 1);
  end if;

  return jsonb_build_object(
    'plan_label', v_settings.plan_label,
    'warning_percent', v_settings.warning_percent,
    'danger_percent', v_settings.danger_percent,
    'critical_percent', v_settings.critical_percent,
    'database', jsonb_build_object(
      'used_bytes', v_db_used,
      'limit_bytes', v_settings.database_limit_bytes,
      'remaining_bytes', case when v_settings.database_limit_bytes is null then null else greatest(v_settings.database_limit_bytes-v_db_used,0) end,
      'percent', v_db_percent
    ),
    'storage', jsonb_build_object(
      'used_bytes', v_storage_used,
      'limit_bytes', v_settings.storage_limit_bytes,
      'remaining_bytes', case when v_settings.storage_limit_bytes is null then null else greatest(v_settings.storage_limit_bytes-v_storage_used,0) end,
      'percent', v_storage_percent,
      'object_count', v_storage_count
    ),
    'checked_at', now()
  );
end;
$function$;
revoke all on function private.ops_capacity_snapshot() from public,anon,authenticated;

create or replace function private.ops_refresh_capacity_health()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_snapshot jsonb;
  v_warning integer;
  v_danger integer;
  v_critical integer;
  v_db_percent numeric;
  v_storage_percent numeric;
  v_status text;
  v_severity text;
begin
  v_snapshot := private.ops_capacity_snapshot();
  v_warning := (v_snapshot->>'warning_percent')::integer;
  v_danger := (v_snapshot->>'danger_percent')::integer;
  v_critical := (v_snapshot->>'critical_percent')::integer;
  v_db_percent := nullif(v_snapshot->'database'->>'percent','')::numeric;
  v_storage_percent := nullif(v_snapshot->'storage'->>'percent','')::numeric;

  if v_snapshot->'database'->'limit_bytes' = 'null'::jsonb then
    perform private.ops_set_health('supabase-database-capacity','unknown','容量上限が未設定です。管理画面から契約プラン上限を設定してください。');
  else
    v_status := case when v_db_percent >= v_critical then 'error' when v_db_percent >= v_warning then 'warning' else 'healthy' end;
    perform private.ops_set_health('supabase-database-capacity',v_status,format('Database使用率 %s%%',coalesce(v_db_percent,0)));
    if v_db_percent >= v_warning then
      v_severity := case when v_db_percent >= v_critical then 'critical' when v_db_percent >= v_danger then 'error' else 'warning' end;
      perform private.ops_upsert_event('warning',v_severity,'capacity-monitor','SUPABASE_DATABASE_CAPACITY',format('Supabase Database使用率が%s%%です。',v_db_percent),'supabase-capacity',null,null,null);
    else
      update public.ops_events set status='resolved',resolved_at=now(),updated_at=now()
       where source='capacity-monitor' and error_code='SUPABASE_DATABASE_CAPACITY' and status<>'resolved';
    end if;
  end if;

  if v_snapshot->'storage'->'limit_bytes' = 'null'::jsonb then
    perform private.ops_set_health('supabase-storage-capacity','unknown','Storage容量上限が未設定です。管理画面から契約プラン上限を設定してください。');
  else
    v_status := case when v_storage_percent >= v_critical then 'error' when v_storage_percent >= v_warning then 'warning' else 'healthy' end;
    perform private.ops_set_health('supabase-storage-capacity',v_status,format('Storage使用率 %s%%',coalesce(v_storage_percent,0)));
    if v_storage_percent >= v_warning then
      v_severity := case when v_storage_percent >= v_critical then 'critical' when v_storage_percent >= v_danger then 'error' else 'warning' end;
      perform private.ops_upsert_event('warning',v_severity,'capacity-monitor','SUPABASE_STORAGE_CAPACITY',format('Supabase Storage使用率が%s%%です。',v_storage_percent),'supabase-capacity',null,null,null);
    else
      update public.ops_events set status='resolved',resolved_at=now(),updated_at=now()
       where source='capacity-monitor' and error_code='SUPABASE_STORAGE_CAPACITY' and status<>'resolved';
    end if;
  end if;

  return v_snapshot;
exception when others then
  perform private.ops_upsert_event('error','error','capacity-monitor','SUPABASE_CAPACITY_CHECK_FAILED','Supabase容量監視の実行に失敗しました。','supabase-capacity',null,null,null);
  return private.ops_capacity_snapshot();
end;
$function$;
revoke all on function private.ops_refresh_capacity_health() from public,anon,authenticated;

create or replace function public.admin_ops_update_capacity_settings(
  p_plan_label text,
  p_database_limit_bytes bigint,
  p_storage_limit_bytes bigint,
  p_warning_percent integer,
  p_danger_percent integer,
  p_critical_percent integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_label text := left(coalesce(nullif(trim(p_plan_label),''),'未設定'),80);
begin
  if v_admin is null or not (select private.is_active_admin()) then raise exception 'active admin required' using errcode='42501'; end if;
  if p_database_limit_bytes is not null and p_database_limit_bytes <= 0 then raise exception 'invalid database limit' using errcode='22023'; end if;
  if p_storage_limit_bytes is not null and p_storage_limit_bytes <= 0 then raise exception 'invalid storage limit' using errcode='22023'; end if;
  if p_warning_percent < 1 or p_danger_percent <= p_warning_percent or p_critical_percent <= p_danger_percent or p_critical_percent > 100 then
    raise exception 'invalid capacity thresholds' using errcode='22023';
  end if;
  update public.ops_capacity_settings set
    plan_label=v_label,database_limit_bytes=p_database_limit_bytes,storage_limit_bytes=p_storage_limit_bytes,
    warning_percent=p_warning_percent,danger_percent=p_danger_percent,critical_percent=p_critical_percent,
    updated_at=now(),updated_by=v_admin
   where singleton=true;
  return private.ops_refresh_capacity_health();
end;
$function$;
revoke all on function public.admin_ops_update_capacity_settings(text,bigint,bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_ops_update_capacity_settings(text,bigint,bigint,integer,integer,integer) to authenticated;

create or replace function public.admin_ops_refresh_capacity()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then raise exception 'active admin required' using errcode='42501'; end if;
  return private.ops_refresh_capacity_health();
end;
$function$;
revoke all on function public.admin_ops_refresh_capacity() from public,anon,authenticated;
grant execute on function public.admin_ops_refresh_capacity() to authenticated;

create or replace function public.admin_ops_get_snapshot(p_limit integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(10,least(coalesce(p_limit,80),200));
  v_counts jsonb; v_events jsonb; v_health jsonb; v_runs jsonb; v_findings jsonb; v_capacity jsonb; v_latest uuid;
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
  v_capacity := private.ops_capacity_snapshot();
  return jsonb_build_object('counts',v_counts,'events',v_events,'health',v_health,'runs',v_runs,'findings',v_findings,'capacity',v_capacity);
end;
$function$;
revoke all on function public.admin_ops_get_snapshot(integer) from public,anon,authenticated;
grant execute on function public.admin_ops_get_snapshot(integer) to authenticated;

-- Run capacity monitoring independently so a capacity check can never block the security audit job.
do $block$
declare v_existing bigint;
begin
  if pg_catalog.to_regclass('cron.job') is not null then
    select jobid into v_existing from cron.job where jobname='aas-ops-capacity-hourly' limit 1;
    if v_existing is not null then perform cron.unschedule(v_existing); end if;
    perform cron.schedule('aas-ops-capacity-hourly','5 * * * *',$cron$select private.ops_refresh_capacity_health();$cron$);
  end if;
end;
$block$;

select private.ops_refresh_capacity_health();

commit;
