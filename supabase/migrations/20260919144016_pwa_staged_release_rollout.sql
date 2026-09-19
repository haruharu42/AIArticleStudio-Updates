-- Three-stage PWA release rollout: admin preview -> selected user testers -> public.
-- Remote migration: 20260919144016 pwa_staged_release_rollout

alter table public.app_release_channels
  add column if not exists candidate_stage text;

update public.app_release_channels
set candidate_stage = case when candidate_release_id is null then null else 'admin' end
where candidate_stage is null;

alter table public.app_release_channels
  drop constraint if exists app_release_channels_candidate_stage_check;

alter table public.app_release_channels
  add constraint app_release_channels_candidate_stage_check check (
    (candidate_release_id is null and candidate_stage is null)
    or
    (candidate_release_id is not null and candidate_stage in ('admin','tester'))
  );

create table if not exists public.app_release_testers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_release_testers enable row level security;
alter table public.app_release_testers force row level security;
revoke all on table public.app_release_testers from anon, authenticated;

insert into public.app_release_testers (user_id, enabled, created_by, created_at, updated_at)
select p.id, true, null, now(), now()
from public.profiles p
where p.aas_user_id = 'AAS-000002'
  and p.role = 'user'
  and p.status = 'active'
on conflict (user_id) do update
set enabled = true,
    updated_at = now();

alter table public.app_release_audit
  drop constraint if exists app_release_audit_action_check;

alter table public.app_release_audit
  add constraint app_release_audit_action_check check (
    action in (
      'candidate_created',
      'candidate_promoted_to_tester',
      'tester_added',
      'tester_removed',
      'published',
      'user_accepted',
      'rolled_back'
    )
  );

create or replace function public.get_my_app_release_state(p_audience text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_status text;
  v_channel public.app_release_channels%rowtype;
  v_state public.user_release_state%rowtype;
  v_current public.app_releases%rowtype;
  v_effective public.app_releases%rowtype;
  v_available public.app_releases%rowtype;
  v_admin boolean := false;
  v_tester boolean := false;
  v_preview_allowed boolean := true;
  v_audience text := lower(btrim(coalesce(p_audience, 'public')));
begin
  if v_audience not in ('public','preview') then
    raise exception 'invalid release audience' using errcode = '22023';
  end if;

  if v_user is null then
    return jsonb_build_object(
      'signed_in', false,
      'preview_allowed', (v_audience = 'public')
    );
  end if;

  select p.role, p.status into v_role, v_status
  from public.profiles p
  where p.id = v_user;

  if v_status is distinct from 'active' then
    return jsonb_build_object(
      'signed_in', true,
      'active', false,
      'preview_allowed', false
    );
  end if;

  v_admin := (v_role = 'admin');
  v_tester := exists (
    select 1
    from public.app_release_testers t
    where t.user_id = v_user
      and t.enabled = true
      and v_role = 'user'
  );

  select * into v_channel
  from public.app_release_channels c
  where c.channel = 'pwa';

  if v_channel.current_release_id is null then
    return jsonb_build_object(
      'signed_in', true,
      'active', true,
      'configured', false,
      'is_admin', v_admin,
      'is_release_tester', v_tester,
      'candidate_stage', v_channel.candidate_stage,
      'preview_allowed', case
        when v_audience = 'public' then true
        when v_admin then true
        when v_tester and v_channel.candidate_stage = 'tester' then true
        else false
      end
    );
  end if;

  select * into v_state
  from public.user_release_state s
  where s.user_id = v_user;

  if not found then
    insert into public.user_release_state (
      user_id, channel, current_release_id, accepted_at, updated_at
    )
    values (
      v_user, 'pwa', v_channel.current_release_id, now(), now()
    )
    returning * into v_state;
  end if;

  select * into v_current
  from public.app_releases r
  where r.id = v_state.current_release_id;

  v_effective := v_current;

  if v_audience = 'preview' and v_channel.candidate_release_id is not null then
    if v_admin or (v_tester and v_channel.candidate_stage = 'tester') then
      select * into v_effective
      from public.app_releases r
      where r.id = v_channel.candidate_release_id
        and r.channel = 'pwa'
        and r.status = 'candidate';
      if v_effective.id is null then
        v_effective := v_current;
      end if;
    end if;
  end if;

  v_preview_allowed := case
    when v_audience = 'public' then true
    when v_admin then true
    when v_tester and v_channel.candidate_stage = 'tester' and v_channel.candidate_release_id is not null then true
    else false
  end;

  if v_audience = 'public'
     and not v_admin
     and v_state.current_release_id <> v_channel.current_release_id then
    select * into v_available
    from public.app_releases r
    where r.id = v_channel.current_release_id
      and r.channel = 'pwa'
      and r.status = 'published';
  end if;

  return jsonb_build_object(
    'signed_in', true,
    'active', true,
    'configured', true,
    'is_admin', v_admin,
    'is_release_tester', v_tester,
    'candidate_stage', v_channel.candidate_stage,
    'preview_allowed', v_preview_allowed,
    'is_admin_preview', (
      v_audience = 'preview'
      and v_admin
      and v_channel.candidate_release_id is not null
      and v_effective.id = v_channel.candidate_release_id
    ),
    'is_tester_preview', (
      v_audience = 'preview'
      and not v_admin
      and v_tester
      and v_channel.candidate_stage = 'tester'
      and v_channel.candidate_release_id is not null
      and v_effective.id = v_channel.candidate_release_id
    ),
    'current_release', jsonb_build_object(
      'id', v_current.id, 'version', v_current.version, 'title', v_current.title,
      'notes', v_current.notes, 'build_key', v_current.build_key, 'update_kind', v_current.update_kind
    ),
    'effective_release', jsonb_build_object(
      'id', v_effective.id, 'version', v_effective.version, 'title', v_effective.title,
      'notes', v_effective.notes, 'build_key', v_effective.build_key, 'update_kind', v_effective.update_kind
    ),
    'available_release', case
      when v_available.id is null then null
      else jsonb_build_object(
        'id', v_available.id, 'version', v_available.version, 'title', v_available.title,
        'notes', v_available.notes, 'build_key', v_available.build_key, 'update_kind', v_available.update_kind
      )
    end,
    'update_required', (v_available.id is not null and v_available.update_kind = 'required')
  );
end;
$function$;

create or replace function public.get_my_app_release_state()
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select public.get_my_app_release_state('public');
$function$;

create or replace function public.accept_app_release(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_channel public.app_release_channels%rowtype;
  v_release public.app_releases%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.status = 'active') then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  select * into v_channel from public.app_release_channels c where c.channel = 'pwa';
  if v_channel.current_release_id is null or v_channel.current_release_id <> p_release_id then
    raise exception 'release is not the current public release' using errcode = '22023';
  end if;

  select * into v_release
  from public.app_releases r
  where r.id = p_release_id and r.channel = 'pwa' and r.status = 'published';
  if v_release.id is null then raise exception 'release is not publishable' using errcode = '22023'; end if;

  insert into public.user_release_state (
    user_id, channel, current_release_id, last_notified_release_id, accepted_at, updated_at
  )
  values (v_user, 'pwa', p_release_id, p_release_id, now(), now())
  on conflict (user_id) do update
    set current_release_id = excluded.current_release_id,
        last_notified_release_id = excluded.last_notified_release_id,
        accepted_at = excluded.accepted_at,
        updated_at = excluded.updated_at;

  insert into public.app_release_audit (actor_user_id, action, release_id)
  values (v_user, 'user_accepted', p_release_id);

  return public.get_my_app_release_state('public');
end;
$function$;

create or replace function public.admin_list_app_releases()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_channel public.app_release_channels%rowtype;
begin
  if not private.is_active_admin() then raise exception 'active admin required' using errcode = '42501'; end if;

  select * into v_channel from public.app_release_channels c where c.channel = 'pwa';

  return jsonb_build_object(
    'channel', jsonb_build_object(
      'current_release_id', v_channel.current_release_id,
      'candidate_release_id', v_channel.candidate_release_id,
      'candidate_stage', v_channel.candidate_stage,
      'updated_at', v_channel.updated_at
    ),
    'releases', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id, 'version', r.version, 'title', r.title, 'notes', r.notes,
          'status', r.status, 'update_kind', r.update_kind, 'build_key', r.build_key,
          'created_at', r.created_at, 'published_at', r.published_at, 'retired_at', r.retired_at,
          'adopted_users', (select count(*) from public.user_release_state s where s.current_release_id = r.id)
        ) order by r.created_at desc
      )
      from public.app_releases r where r.channel = 'pwa'
    ), '[]'::jsonb),
    'testers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'aas_user_id', p.aas_user_id,
          'enabled', t.enabled,
          'created_at', t.created_at,
          'updated_at', t.updated_at
        ) order by p.aas_user_id
      )
      from public.app_release_testers t
      join public.profiles p on p.id = t.user_id
      where p.role = 'user'
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_create_app_release(
  p_version text, p_title text, p_notes text, p_update_kind text, p_build_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_existing_candidate uuid;
  v_release public.app_releases%rowtype;
begin
  if not private.is_active_admin() then raise exception 'active admin required' using errcode = '42501'; end if;

  p_version := btrim(coalesce(p_version, ''));
  p_title := btrim(coalesce(p_title, ''));
  p_notes := btrim(coalesce(p_notes, ''));
  p_build_key := btrim(coalesce(p_build_key, ''));
  p_update_kind := lower(btrim(coalesce(p_update_kind, 'optional')));

  if p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$' then raise exception 'invalid release version' using errcode = '22023'; end if;
  if char_length(p_title) < 1 or char_length(p_title) > 120 then raise exception 'invalid release title' using errcode = '22023'; end if;
  if char_length(p_notes) > 4000 then raise exception 'release notes too long' using errcode = '22023'; end if;
  if p_update_kind not in ('optional','required') then raise exception 'invalid update kind' using errcode = '22023'; end if;
  if p_build_key !~ '^[0-9A-Za-z._-]{3,120}$' then raise exception 'invalid build key' using errcode = '22023'; end if;

  select c.candidate_release_id into v_existing_candidate
  from public.app_release_channels c where c.channel = 'pwa' for update;

  if v_existing_candidate is not null then
    update public.app_releases set status = 'retired', retired_at = now()
    where id = v_existing_candidate and status = 'candidate';
  end if;

  insert into public.app_releases (
    channel, version, title, notes, status, update_kind, build_key, created_by
  )
  values ('pwa', p_version, p_title, p_notes, 'candidate', p_update_kind, p_build_key, v_admin)
  returning * into v_release;

  update public.app_release_channels
  set candidate_release_id = v_release.id,
      candidate_stage = 'admin',
      updated_by = v_admin,
      updated_at = now()
  where channel = 'pwa';

  insert into public.app_release_audit (actor_user_id, action, release_id, metadata)
  values (v_admin, 'candidate_created', v_release.id, jsonb_build_object('candidate_stage', 'admin'));

  return public.admin_list_app_releases();
end;
$function$;

create or replace function public.admin_set_app_release_tester(p_aas_user_id text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_target uuid;
  v_aas_user_id text := upper(btrim(coalesce(p_aas_user_id, '')));
begin
  if not private.is_active_admin() then raise exception 'active admin required' using errcode = '42501'; end if;

  select p.id into v_target
  from public.profiles p
  where p.aas_user_id = v_aas_user_id and p.role = 'user' and p.status = 'active';

  if v_target is null then raise exception 'active user tester not found' using errcode = '22023'; end if;

  if p_enabled then
    insert into public.app_release_testers (user_id, enabled, created_by, created_at, updated_at)
    values (v_target, true, v_admin, now(), now())
    on conflict (user_id) do update set enabled = true, updated_at = now();

    insert into public.app_release_audit (actor_user_id, action, metadata)
    values (v_admin, 'tester_added', jsonb_build_object('aas_user_id', v_aas_user_id));
  else
    update public.app_release_testers set enabled = false, updated_at = now() where user_id = v_target;
    insert into public.app_release_audit (actor_user_id, action, metadata)
    values (v_admin, 'tester_removed', jsonb_build_object('aas_user_id', v_aas_user_id));
  end if;

  return public.admin_list_app_releases();
end;
$function$;

create or replace function public.admin_promote_app_release_to_testers(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_channel public.app_release_channels%rowtype;
begin
  if not private.is_active_admin() then raise exception 'active admin required' using errcode = '42501'; end if;

  select * into v_channel from public.app_release_channels c where c.channel = 'pwa' for update;

  if v_channel.candidate_release_id is null or v_channel.candidate_release_id <> p_release_id then
    raise exception 'release is not the active candidate' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_releases r where r.id = p_release_id and r.channel = 'pwa' and r.status = 'candidate') then
    raise exception 'candidate release not found' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.app_release_testers t
    join public.profiles p on p.id = t.user_id
    where t.enabled = true and p.role = 'user' and p.status = 'active'
  ) then
    raise exception 'at least one active release tester is required' using errcode = '22023';
  end if;
  if v_channel.candidate_stage = 'tester' then return public.admin_list_app_releases(); end if;
  if v_channel.candidate_stage is distinct from 'admin' then
    raise exception 'candidate is not in admin test stage' using errcode = '22023';
  end if;

  update public.app_release_channels
  set candidate_stage = 'tester', updated_by = v_admin, updated_at = now()
  where channel = 'pwa';

  insert into public.app_release_audit (actor_user_id, action, release_id, metadata)
  values (v_admin, 'candidate_promoted_to_tester', p_release_id, jsonb_build_object('candidate_stage', 'tester'));

  return public.admin_list_app_releases();
end;
$function$;

create or replace function public.admin_publish_app_release(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_channel public.app_release_channels%rowtype;
begin
  if not private.is_active_admin() then raise exception 'active admin required' using errcode = '42501'; end if;

  select * into v_channel from public.app_release_channels c where c.channel = 'pwa' for update;

  if v_channel.candidate_release_id is null or v_channel.candidate_release_id <> p_release_id then
    raise exception 'release is not the active candidate' using errcode = '22023';
  end if;
  if v_channel.candidate_stage is distinct from 'tester' then
    raise exception 'candidate must pass tester stage before publish' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.app_release_testers t
    join public.profiles p on p.id = t.user_id
    where t.enabled = true and p.role = 'user' and p.status = 'active'
  ) then
    raise exception 'active release tester required before publish' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_releases r where r.id = p_release_id and r.channel = 'pwa' and r.status = 'candidate') then
    raise exception 'candidate release not found' using errcode = '22023';
  end if;

  update public.app_releases set status = 'published', published_at = now(), retired_at = null
  where id = p_release_id;

  update public.app_release_channels
  set current_release_id = p_release_id,
      candidate_release_id = null,
      candidate_stage = null,
      updated_by = v_admin,
      updated_at = now()
  where channel = 'pwa';

  insert into public.app_release_audit (actor_user_id, action, release_id, target_release_id)
  values (v_admin, 'published', p_release_id, v_channel.current_release_id);

  return public.admin_list_app_releases();
end;
$function$;

create or replace function public.admin_rollback_app_release(p_target_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_channel public.app_release_channels%rowtype;
  v_current uuid;
begin
  if not private.is_active_admin() then raise exception 'active admin required' using errcode = '42501'; end if;

  select * into v_channel from public.app_release_channels c where c.channel = 'pwa' for update;
  v_current := v_channel.current_release_id;

  if p_target_release_id is null or p_target_release_id = v_current then
    raise exception 'choose a different published release' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.app_releases r
    where r.id = p_target_release_id and r.channel = 'pwa' and r.status = 'published'
  ) then
    raise exception 'rollback target must be a published release' using errcode = '22023';
  end if;

  update public.app_releases set status = 'rolled_back', retired_at = now()
  where id = v_current and status = 'published';

  update public.app_release_channels
  set current_release_id = p_target_release_id,
      candidate_release_id = null,
      candidate_stage = null,
      updated_by = v_admin,
      updated_at = now()
  where channel = 'pwa';

  update public.user_release_state
  set current_release_id = p_target_release_id,
      last_notified_release_id = p_target_release_id,
      accepted_at = now(),
      updated_at = now()
  where current_release_id = v_current;

  insert into public.app_release_audit (actor_user_id, action, release_id, target_release_id)
  values (v_admin, 'rolled_back', v_current, p_target_release_id);

  return public.admin_list_app_releases();
end;
$function$;

revoke all on function public.get_my_app_release_state(text) from public, anon;
revoke all on function public.get_my_app_release_state() from public, anon;
revoke all on function public.accept_app_release(uuid) from public, anon;
revoke all on function public.admin_list_app_releases() from public, anon;
revoke all on function public.admin_create_app_release(text,text,text,text,text) from public, anon;
revoke all on function public.admin_set_app_release_tester(text,boolean) from public, anon;
revoke all on function public.admin_promote_app_release_to_testers(uuid) from public, anon;
revoke all on function public.admin_publish_app_release(uuid) from public, anon;
revoke all on function public.admin_rollback_app_release(uuid) from public, anon;

grant execute on function public.get_my_app_release_state(text) to authenticated;
grant execute on function public.get_my_app_release_state() to authenticated;
grant execute on function public.accept_app_release(uuid) to authenticated;
grant execute on function public.admin_list_app_releases() to authenticated;
grant execute on function public.admin_create_app_release(text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_app_release_tester(text,boolean) to authenticated;
grant execute on function public.admin_promote_app_release_to_testers(uuid) to authenticated;
grant execute on function public.admin_publish_app_release(uuid) to authenticated;
grant execute on function public.admin_rollback_app_release(uuid) to authenticated;
