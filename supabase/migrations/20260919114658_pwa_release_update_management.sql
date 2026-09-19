-- PWA release/update management.
-- Remote migration: 20260919114658 pwa_release_update_management

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'pwa',
  version text not null,
  title text not null,
  notes text not null default '',
  status text not null default 'candidate',
  update_kind text not null default 'optional',
  build_key text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  retired_at timestamptz,
  constraint app_releases_channel_check check (channel = 'pwa'),
  constraint app_releases_status_check check (status in ('candidate','published','retired','rolled_back')),
  constraint app_releases_update_kind_check check (update_kind in ('optional','required')),
  constraint app_releases_version_check check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'),
  constraint app_releases_build_key_check check (build_key ~ '^[0-9A-Za-z._-]{3,120}$'),
  constraint app_releases_version_unique unique (channel, version),
  constraint app_releases_build_unique unique (channel, build_key)
);

create table if not exists public.app_release_channels (
  channel text primary key,
  current_release_id uuid references public.app_releases(id) on delete restrict,
  candidate_release_id uuid references public.app_releases(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_release_channels_channel_check check (channel = 'pwa'),
  constraint app_release_channels_distinct_check check (
    current_release_id is null or candidate_release_id is null or current_release_id <> candidate_release_id
  )
);

create table if not exists public.user_release_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  channel text not null default 'pwa',
  current_release_id uuid not null references public.app_releases(id) on delete restrict,
  last_notified_release_id uuid references public.app_releases(id) on delete set null,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_release_state_channel_check check (channel = 'pwa')
);

create index if not exists user_release_state_current_release_idx
  on public.user_release_state(current_release_id);

create table if not exists public.app_release_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  release_id uuid references public.app_releases(id) on delete set null,
  target_release_id uuid references public.app_releases(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_release_audit_action_check check (
    action in ('candidate_created','published','user_accepted','rolled_back')
  )
);

alter table public.app_releases enable row level security;
alter table public.app_release_channels enable row level security;
alter table public.user_release_state enable row level security;
alter table public.app_release_audit enable row level security;
alter table public.app_releases force row level security;
alter table public.app_release_channels force row level security;
alter table public.user_release_state force row level security;
alter table public.app_release_audit force row level security;

revoke all on table public.app_releases from anon, authenticated;
revoke all on table public.app_release_channels from anon, authenticated;
revoke all on table public.user_release_state from anon, authenticated;
revoke all on table public.app_release_audit from anon, authenticated;
revoke all on sequence public.app_release_audit_id_seq from anon, authenticated;

insert into public.app_releases (
  channel, version, title, notes, status, update_kind, build_key, created_by, published_at
)
values (
  'pwa',
  '0.1.0',
  'AI Article Studio PWA baseline',
  'リリース管理導入時の基準版です。',
  'published',
  'optional',
  'pwa-0.1.0-baseline',
  null,
  now()
)
on conflict (channel, version) do nothing;

insert into public.app_release_channels (channel, current_release_id, candidate_release_id, updated_by, updated_at)
select 'pwa', r.id, null, null, now()
from public.app_releases r
where r.channel = 'pwa' and r.version = '0.1.0'
on conflict (channel) do nothing;

create or replace function public.get_my_app_release_state()
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
begin
  if v_user is null then return jsonb_build_object('signed_in', false); end if;

  select p.role, p.status into v_role, v_status
  from public.profiles p where p.id = v_user;

  if v_status is distinct from 'active' then
    return jsonb_build_object('signed_in', true, 'active', false);
  end if;

  v_admin := (v_role = 'admin');
  select * into v_channel from public.app_release_channels c where c.channel = 'pwa';

  if v_channel.current_release_id is null then
    return jsonb_build_object('signed_in', true, 'active', true, 'configured', false, 'is_admin', v_admin);
  end if;

  select * into v_state from public.user_release_state s where s.user_id = v_user;
  if not found then
    insert into public.user_release_state (user_id, channel, current_release_id, accepted_at, updated_at)
    values (v_user, 'pwa', v_channel.current_release_id, now(), now())
    returning * into v_state;
  end if;

  select * into v_current from public.app_releases r where r.id = v_state.current_release_id;

  if v_admin and v_channel.candidate_release_id is not null then
    select * into v_effective
    from public.app_releases r
    where r.id = v_channel.candidate_release_id and r.status = 'candidate';
  end if;
  if v_effective.id is null then v_effective := v_current; end if;

  if not v_admin and v_state.current_release_id <> v_channel.current_release_id then
    select * into v_available
    from public.app_releases r
    where r.id = v_channel.current_release_id and r.status = 'published';
  end if;

  return jsonb_build_object(
    'signed_in', true,
    'active', true,
    'configured', true,
    'is_admin', v_admin,
    'is_admin_preview', (v_admin and v_channel.candidate_release_id is not null and v_effective.id is not null),
    'current_release', jsonb_build_object(
      'id', v_current.id, 'version', v_current.version, 'title', v_current.title,
      'notes', v_current.notes, 'build_key', v_current.build_key, 'update_kind', v_current.update_kind
    ),
    'effective_release', jsonb_build_object(
      'id', v_effective.id, 'version', v_effective.version, 'title', v_effective.title,
      'notes', v_effective.notes, 'build_key', v_effective.build_key, 'update_kind', v_effective.update_kind
    ),
    'available_release', case when v_available.id is null then null else jsonb_build_object(
      'id', v_available.id, 'version', v_available.version, 'title', v_available.title,
      'notes', v_available.notes, 'build_key', v_available.build_key, 'update_kind', v_available.update_kind
    ) end,
    'update_required', (v_available.id is not null and v_available.update_kind = 'required')
  );
end;
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

  return public.get_my_app_release_state();
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
  if not private.is_active_admin() then
    raise exception 'active admin required' using errcode = '42501';
  end if;

  select * into v_channel from public.app_release_channels c where c.channel = 'pwa';

  return jsonb_build_object(
    'channel', jsonb_build_object(
      'current_release_id', v_channel.current_release_id,
      'candidate_release_id', v_channel.candidate_release_id,
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
  set candidate_release_id = v_release.id, updated_by = v_admin, updated_at = now()
  where channel = 'pwa';

  insert into public.app_release_audit (actor_user_id, action, release_id)
  values (v_admin, 'candidate_created', v_release.id);

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
  if not exists (select 1 from public.app_releases r where r.id = p_release_id and r.channel = 'pwa' and r.status = 'candidate') then
    raise exception 'candidate release not found' using errcode = '22023';
  end if;

  update public.app_releases set status = 'published', published_at = now(), retired_at = null where id = p_release_id;
  update public.app_release_channels
  set current_release_id = p_release_id, candidate_release_id = null, updated_by = v_admin, updated_at = now()
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
  if not exists (select 1 from public.app_releases r where r.id = p_target_release_id and r.channel = 'pwa' and r.status = 'published') then
    raise exception 'rollback target must be a published release' using errcode = '22023';
  end if;

  update public.app_releases set status = 'rolled_back', retired_at = now()
  where id = v_current and status = 'published';

  update public.app_release_channels
  set current_release_id = p_target_release_id, candidate_release_id = null, updated_by = v_admin, updated_at = now()
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

revoke all on function public.get_my_app_release_state() from public, anon;
revoke all on function public.accept_app_release(uuid) from public, anon;
revoke all on function public.admin_list_app_releases() from public, anon;
revoke all on function public.admin_create_app_release(text,text,text,text,text) from public, anon;
revoke all on function public.admin_publish_app_release(uuid) from public, anon;
revoke all on function public.admin_rollback_app_release(uuid) from public, anon;

grant execute on function public.get_my_app_release_state() to authenticated;
grant execute on function public.accept_app_release(uuid) to authenticated;
grant execute on function public.admin_list_app_releases() to authenticated;
grant execute on function public.admin_create_app_release(text,text,text,text,text) to authenticated;
grant execute on function public.admin_publish_app_release(uuid) to authenticated;
grant execute on function public.admin_rollback_app_release(uuid) to authenticated;
