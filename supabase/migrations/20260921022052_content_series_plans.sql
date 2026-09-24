create table if not exists public.content_series_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('note','tips','brain','blog')),
  audience text not null default '',
  purpose text not null default '',
  monetization text not null default '',
  status text not null default 'planning' check (status in ('planning','active','completed','archived')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_series_plans_name_length check (char_length(name) between 1 and 200),
  constraint content_series_plans_audience_length check (char_length(audience) <= 600),
  constraint content_series_plans_purpose_length check (char_length(purpose) <= 1200),
  constraint content_series_plans_monetization_length check (char_length(monetization) <= 600),
  constraint content_series_plans_items_array check (jsonb_typeof(items) = 'array'),
  constraint content_series_plans_items_size check (pg_column_size(items) <= 65536)
);

create index if not exists content_series_plans_user_updated_idx
  on public.content_series_plans(user_id, updated_at desc);
create index if not exists content_series_plans_user_status_idx
  on public.content_series_plans(user_id, status, updated_at desc);

alter table public.content_series_plans enable row level security;
alter table public.content_series_plans force row level security;

drop policy if exists content_series_plans_select_own_active on public.content_series_plans;
create policy content_series_plans_select_own_active
on public.content_series_plans for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists content_series_plans_insert_own_active on public.content_series_plans;
create policy content_series_plans_insert_own_active
on public.content_series_plans for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists content_series_plans_update_own_active on public.content_series_plans;
create policy content_series_plans_update_own_active
on public.content_series_plans for update to authenticated
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

drop policy if exists content_series_plans_delete_own_active on public.content_series_plans;
create policy content_series_plans_delete_own_active
on public.content_series_plans for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

revoke all on table public.content_series_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.content_series_plans to authenticated;

create or replace function private.touch_content_series_plan_updated_at()
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

revoke all on function private.touch_content_series_plan_updated_at() from public, anon, authenticated;

drop trigger if exists content_series_plans_touch_updated_at on public.content_series_plans;
create trigger content_series_plans_touch_updated_at
before update on public.content_series_plans
for each row execute function private.touch_content_series_plan_updated_at();

comment on table public.content_series_plans is
  'Owner-scoped series / magazine planning for AAS content lifecycle workflows.';
