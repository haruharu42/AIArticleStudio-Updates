begin;

alter table public.profiles
    alter column status set default 'pending';

alter table public.profiles
    drop constraint if exists profiles_status_check;

alter table public.profiles
    add constraint profiles_status_check
    check (status in ('pending', 'active', 'suspended', 'disabled'));

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (
        id,
        aas_user_id,
        display_name,
        role,
        status,
        terms_accepted_at,
        privacy_accepted_at,
        ai_terms_accepted_at
    ) values (
        new.id,
        'AAS-' || lpad(nextval('public.aas_user_id_seq')::text, 6, '0'),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
        'user',
        'pending',
        case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now() end,
        case when new.raw_user_meta_data ->> 'privacy_accepted' = 'true' then now() end,
        case when new.raw_user_meta_data ->> 'ai_terms_accepted' = 'true' then now() end
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create table if not exists public.admin_user_actions (
    id bigint generated always as identity primary key,
    admin_user_id uuid not null references public.profiles(id),
    target_user_id uuid not null references public.profiles(id),
    action text not null check (action in ('approve', 'suspend', 'reactivate')),
    old_status text not null check (old_status in ('pending', 'active', 'suspended', 'disabled')),
    new_status text not null check (new_status in ('active', 'suspended')),
    created_at timestamptz not null default now()
);

alter table public.admin_user_actions enable row level security;
alter table public.admin_user_actions force row level security;

revoke all on table public.admin_user_actions from public, anon, authenticated;
revoke all on sequence public.admin_user_actions_id_seq from public, anon, authenticated;

create index if not exists admin_user_actions_admin_created_idx
    on public.admin_user_actions (admin_user_id, created_at desc);
create index if not exists admin_user_actions_target_created_idx
    on public.admin_user_actions (target_user_id, created_at desc);
create index if not exists profiles_pending_created_idx
    on public.profiles (created_at desc)
    where status = 'pending';

create or replace function public.admin_list_users(p_aas_user_id text default null)
returns table (
    id uuid,
    aas_user_id text,
    display_name text,
    role text,
    status text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    return query
    select
        profile.id,
        profile.aas_user_id,
        profile.display_name,
        profile.role,
        profile.status,
        profile.created_at
    from public.profiles as profile
    where nullif(trim(p_aas_user_id), '') is null
       or upper(profile.aas_user_id) = upper(trim(p_aas_user_id))
    order by
        case profile.status
            when 'pending' then 1
            when 'active' then 2
            when 'suspended' then 3
            when 'disabled' then 4
            else 5
        end,
        profile.created_at desc,
        profile.aas_user_id;
end;
$$;

revoke execute on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;

create or replace function public.admin_set_user_status(
    p_target_user_id uuid,
    p_new_status text
)
returns table (
    id uuid,
    aas_user_id text,
    display_name text,
    role text,
    status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_admin_id uuid := (select auth.uid());
    target_old_status text;
    target_role text;
    action_name text;
begin
    if current_admin_id is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if p_new_status not in ('active', 'suspended') then
        raise exception 'invalid target status' using errcode = '22023';
    end if;

    select profile.status, profile.role
    into target_old_status, target_role
    from public.profiles as profile
    where profile.id = p_target_user_id
    for update;

    if not found then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;

    if current_admin_id = p_target_user_id and p_new_status = 'suspended' then
        raise exception 'current admin cannot suspend itself' using errcode = '42501';
    end if;

    if target_old_status = 'pending' and p_new_status = 'active' then
        action_name := 'approve';
    elsif target_old_status = 'active' and p_new_status = 'suspended' then
        action_name := 'suspend';
    elsif target_old_status = 'suspended' and p_new_status = 'active' then
        action_name := 'reactivate';
    else
        raise exception 'invalid status transition' using errcode = '22023';
    end if;

    update public.profiles as profile
    set status = p_new_status
    where profile.id = p_target_user_id;

    insert into public.admin_user_actions (
        admin_user_id,
        target_user_id,
        action,
        old_status,
        new_status
    ) values (
        current_admin_id,
        p_target_user_id,
        action_name,
        target_old_status,
        p_new_status
    );

    return query
    select
        profile.id,
        profile.aas_user_id,
        profile.display_name,
        profile.role,
        profile.status,
        profile.created_at
    from public.profiles as profile
    where profile.id = p_target_user_id;
end;
$$;

revoke execute on function public.admin_set_user_status(uuid, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;

create or replace function public.accept_current_terms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;

    update public.profiles
    set terms_accepted_at = coalesce(terms_accepted_at, now()),
        privacy_accepted_at = coalesce(privacy_accepted_at, now()),
        ai_terms_accepted_at = coalesce(ai_terms_accepted_at, now())
    where id = (select auth.uid())
      and status in ('pending', 'active');

    if not found then
        raise exception 'eligible profile not found' using errcode = '42501';
    end if;
end;
$$;

revoke execute on function public.accept_current_terms() from public, anon;
grant execute on function public.accept_current_terms() to authenticated;

commit;
