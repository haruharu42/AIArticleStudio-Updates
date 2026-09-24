create table if not exists public.user_platform_account_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('note','tips','brain')),
  preset_name text not null check (char_length(preset_name) between 1 and 80),
  account_name text not null default '' check (char_length(account_name) <= 120),
  account_handle text not null default '' check (char_length(account_handle) <= 120),
  genre text not null default '' check (char_length(genre) <= 160),
  account_style text not null default '' check (char_length(account_style) <= 240),
  audience text not null default '' check (char_length(audience) <= 400),
  tone text not null default '' check (char_length(tone) <= 180),
  monetization text not null default '' check (char_length(monetization) <= 320),
  operation_goal text not null default '' check (char_length(operation_goal) <= 240),
  profile_note text not null default '' check (char_length(profile_note) <= 1600),
  main_topics text[] not null default '{}'::text[] check (cardinality(main_topics) <= 16),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, preset_name)
);

create unique index if not exists user_platform_account_presets_one_default
on public.user_platform_account_presets(user_id, platform)
where is_default;

alter table public.user_platform_account_presets enable row level security;
alter table public.user_platform_account_presets force row level security;

drop policy if exists platform_account_presets_select_own_active on public.user_platform_account_presets;
create policy platform_account_presets_select_own_active
on public.user_platform_account_presets
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_presets_insert_own_active on public.user_platform_account_presets;
create policy platform_account_presets_insert_own_active
on public.user_platform_account_presets
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_presets_update_own_active on public.user_platform_account_presets;
create policy platform_account_presets_update_own_active
on public.user_platform_account_presets
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_presets_delete_own_active on public.user_platform_account_presets;
create policy platform_account_presets_delete_own_active
on public.user_platform_account_presets
for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

revoke all on table public.user_platform_account_presets from public, anon, authenticated;
grant select, insert, update, delete on table public.user_platform_account_presets to authenticated;

create or replace function private.touch_platform_account_preset_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.touch_platform_account_preset_updated_at() from public, anon, authenticated;

drop trigger if exists platform_account_preset_touch_updated_at on public.user_platform_account_presets;
create trigger platform_account_preset_touch_updated_at
before update on public.user_platform_account_presets
for each row execute function private.touch_platform_account_preset_updated_at();

comment on table public.user_platform_account_presets is
  'Owner-scoped note/Tips/Brain account-specific presets used across AAS PWA features.';
