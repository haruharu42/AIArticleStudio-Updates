-- monthly AI researched note operation plans
-- Remote migration: 20260919131121 note_ai_monthly_schedule_plans

create table if not exists public.note_operation_schedule_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_month date not null,
  ai_provider text not null check (ai_provider in ('chatgpt','gemini','claude')),
  generated_for_date date not null,
  research_summary text not null default '',
  strategy_summary text not null default '',
  assumptions text[] not null default '{}',
  research_sources jsonb not null default '[]'::jsonb,
  recommended_posts_per_week numeric(4,1) not null default 0 check (recommended_posts_per_week between 0 and 21),
  recommended_paid_posts_per_week numeric(4,1) not null default 0 check (recommended_paid_posts_per_week between 0 and 14),
  recommended_max_posts_per_day smallint not null default 1 check (recommended_max_posts_per_day between 0 and 10),
  total_posts smallint not null default 0 check (total_posts between 0 and 200),
  free_posts smallint not null default 0 check (free_posts between 0 and 200),
  paid_posts smallint not null default 0 check (paid_posts between 0 and 200),
  recommendation_reason text not null default '',
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_operation_schedule_plans_month_first check (extract(day from target_month) = 1),
  constraint note_operation_schedule_plans_text_sizes check (
    char_length(research_summary) <= 6000
    and char_length(strategy_summary) <= 6000
    and char_length(recommendation_reason) <= 6000
    and cardinality(assumptions) <= 30
    and pg_column_size(assumptions) <= 16384
    and pg_column_size(research_sources) <= 65536
  ),
  constraint note_operation_schedule_plans_user_month_unique unique (user_id, target_month)
);

create index if not exists note_operation_schedule_plans_user_month_idx
  on public.note_operation_schedule_plans (user_id, target_month desc);

alter table public.note_operation_schedule_plans enable row level security;
alter table public.note_operation_schedule_plans force row level security;

drop policy if exists note_operation_schedule_plans_select_own_active on public.note_operation_schedule_plans;
create policy note_operation_schedule_plans_select_own_active
on public.note_operation_schedule_plans for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists note_operation_schedule_plans_insert_own_active on public.note_operation_schedule_plans;
create policy note_operation_schedule_plans_insert_own_active
on public.note_operation_schedule_plans for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists note_operation_schedule_plans_update_own_active on public.note_operation_schedule_plans;
create policy note_operation_schedule_plans_update_own_active
on public.note_operation_schedule_plans for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
)
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists note_operation_schedule_plans_delete_own_active on public.note_operation_schedule_plans;
create policy note_operation_schedule_plans_delete_own_active
on public.note_operation_schedule_plans for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

revoke all on table public.note_operation_schedule_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.note_operation_schedule_plans to authenticated;

drop trigger if exists note_operation_schedule_plans_touch_updated_at on public.note_operation_schedule_plans;
create trigger note_operation_schedule_plans_touch_updated_at
before update on public.note_operation_schedule_plans
for each row execute function private.touch_note_operation_updated_at();

comment on table public.note_operation_schedule_plans is
  'Per-user monthly AI researched note operation plans and source summaries. Does not store AI provider credentials.';
