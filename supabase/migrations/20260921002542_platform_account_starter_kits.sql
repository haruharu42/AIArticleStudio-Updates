create table if not exists public.platform_account_starter_kits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('note','tips','brain')),
  kit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform),
  constraint platform_account_starter_kits_object check (jsonb_typeof(kit) = 'object'),
  constraint platform_account_starter_kits_size check (pg_column_size(kit) <= 32768)
);

alter table public.platform_account_starter_kits enable row level security;
alter table public.platform_account_starter_kits force row level security;

drop policy if exists platform_account_starter_kits_select_own_active on public.platform_account_starter_kits;
create policy platform_account_starter_kits_select_own_active
on public.platform_account_starter_kits for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_starter_kits_insert_own_active on public.platform_account_starter_kits;
create policy platform_account_starter_kits_insert_own_active
on public.platform_account_starter_kits for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_starter_kits_update_own_active on public.platform_account_starter_kits;
create policy platform_account_starter_kits_update_own_active
on public.platform_account_starter_kits for update to authenticated
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

drop policy if exists platform_account_starter_kits_delete_own_active on public.platform_account_starter_kits;
create policy platform_account_starter_kits_delete_own_active
on public.platform_account_starter_kits for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

revoke all on table public.platform_account_starter_kits from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_account_starter_kits to authenticated;

create or replace function private.touch_platform_account_starter_kit_updated_at()
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

revoke all on function private.touch_platform_account_starter_kit_updated_at() from public, anon, authenticated;

drop trigger if exists platform_account_starter_kits_touch_updated_at on public.platform_account_starter_kits;
create trigger platform_account_starter_kits_touch_updated_at
before update on public.platform_account_starter_kits
for each row execute function private.touch_platform_account_starter_kit_updated_at();

comment on table public.platform_account_starter_kits is
  'AI-generated starter kits for note, Tips, and Brain account setup. Stores planning content only and never passwords, cookies, access tokens, or authentication codes.';
