begin;

create schema if not exists private;
revoke all on schema private from public, anon;

create sequence if not exists public.aas_user_id_seq;
revoke all on sequence public.aas_user_id_seq from public, anon, authenticated;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    aas_user_id text not null unique,
    display_name text,
    role text not null default 'user' check (role in ('user', 'admin')),
    status text not null default 'active' check (status in ('active', 'suspended', 'disabled')),
    terms_accepted_at timestamptz,
    privacy_accepted_at timestamptz,
    ai_terms_accepted_at timestamptz,
    created_at timestamptz not null default now()
);

comment on column public.profiles.role is 'Authorization source. Never trust editable user metadata for this value.';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

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
        'AAS-' || lpad(nextval('public.aas_user_id_seq')::text, 8, '0'),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
        'user',
        'active',
        case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now() end,
        case when new.raw_user_meta_data ->> 'privacy_accepted' = 'true' then now() end,
        case when new.raw_user_meta_data ->> 'ai_terms_accepted' = 'true' then now() end
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

insert into public.profiles (
    id,
    aas_user_id,
    display_name,
    role,
    status,
    terms_accepted_at,
    privacy_accepted_at,
    ai_terms_accepted_at,
    created_at
)
select
    users.id,
    'AAS-' || lpad(nextval('public.aas_user_id_seq')::text, 8, '0'),
    nullif(trim(coalesce(users.raw_user_meta_data ->> 'display_name', '')), ''),
    'user',
    'active',
    case when users.raw_user_meta_data ->> 'terms_accepted' = 'true' then users.created_at end,
    case when users.raw_user_meta_data ->> 'privacy_accepted' = 'true' then users.created_at end,
    case when users.raw_user_meta_data ->> 'ai_terms_accepted' = 'true' then users.created_at end,
    users.created_at
from auth.users as users
where not exists (
    select 1 from public.profiles as existing where existing.id = users.id
)
on conflict (id) do nothing;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and role = 'admin'
          and status = 'active'
    );
$$;

revoke all on function private.is_active_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
    ((select auth.uid()) is not null and id = (select auth.uid()))
    or (select private.is_active_admin())
);

drop policy if exists profiles_update_own_display_name on public.profiles;
create policy profiles_update_own_display_name
on public.profiles
for update
to authenticated
using (
    (select auth.uid()) is not null
    and id = (select auth.uid())
    and status = 'active'
)
with check (
    (select auth.uid()) is not null
    and id = (select auth.uid())
    and status = 'active'
);

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

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
      and status = 'active';

    if not found then
        raise exception 'active profile not found' using errcode = '42501';
    end if;
end;
$$;

revoke all on function public.accept_current_terms() from public, anon;
grant execute on function public.accept_current_terms() to authenticated;

commit;
