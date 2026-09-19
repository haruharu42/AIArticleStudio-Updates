-- note operations planner v1
-- Remote migration: 20260919123613 note_operations_planner_v1

create table if not exists public.note_operation_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  note_display_name text not null default '',
  bio_draft text not null default '',
  target_reader text not null default '',
  main_topics text[] not null default '{}',
  experience_note text not null default '',
  operation_goal text not null default 'habit' check (operation_goal in ('habit','growth','monetize','portfolio')),
  weekly_post_count smallint not null default 3 check (weekly_post_count between 1 and 14),
  paid_posts_per_month smallint not null default 2 check (paid_posts_per_month between 0 and 14),
  preferred_time time without time zone not null default '20:00',
  secondary_time time without time zone not null default '12:00',
  timezone text not null default 'Asia/Tokyo',
  schedule_weeks smallint not null default 4 check (schedule_weeks between 1 and 12),
  account_ready boolean not null default false,
  profile_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_operation_profiles_display_name_length check (char_length(note_display_name) <= 120),
  constraint note_operation_profiles_bio_length check (char_length(bio_draft) <= 1200),
  constraint note_operation_profiles_target_reader_length check (char_length(target_reader) <= 600),
  constraint note_operation_profiles_experience_length check (char_length(experience_note) <= 1200),
  constraint note_operation_profiles_topics_limit check (cardinality(main_topics) <= 12 and pg_column_size(main_topics) <= 8192),
  constraint note_operation_profiles_timezone_length check (char_length(timezone) between 1 and 64)
);

create table if not exists public.note_operation_schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time without time zone not null default '20:00',
  item_type text not null check (item_type in ('free_note','paid_note','review','profile_setup','sns_share')),
  title text not null,
  theme text not null default '',
  status text not null default 'planned' check (status in ('planned','done','skipped')),
  source text not null default 'manual' check (source in ('generated','imported','manual')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_operation_schedule_title_length check (char_length(trim(title)) between 1 and 240),
  constraint note_operation_schedule_theme_length check (char_length(theme) <= 500),
  constraint note_operation_schedule_notes_length check (char_length(notes) <= 1200)
);

create index if not exists note_operation_schedule_user_date_idx
  on public.note_operation_schedule_items (user_id, scheduled_date, scheduled_time, created_at);

alter table public.note_operation_profiles enable row level security;
alter table public.note_operation_profiles force row level security;
alter table public.note_operation_schedule_items enable row level security;
alter table public.note_operation_schedule_items force row level security;

drop policy if exists note_operation_profiles_select_own_active on public.note_operation_profiles;
create policy note_operation_profiles_select_own_active on public.note_operation_profiles for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_profiles_insert_own_active on public.note_operation_profiles;
create policy note_operation_profiles_insert_own_active on public.note_operation_profiles for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_profiles_update_own_active on public.note_operation_profiles;
create policy note_operation_profiles_update_own_active on public.note_operation_profiles for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_profile()))
with check (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_profiles_delete_own_active on public.note_operation_profiles;
create policy note_operation_profiles_delete_own_active on public.note_operation_profiles for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_schedule_select_own_active on public.note_operation_schedule_items;
create policy note_operation_schedule_select_own_active on public.note_operation_schedule_items for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_schedule_insert_own_active on public.note_operation_schedule_items;
create policy note_operation_schedule_insert_own_active on public.note_operation_schedule_items for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_schedule_update_own_active on public.note_operation_schedule_items;
create policy note_operation_schedule_update_own_active on public.note_operation_schedule_items for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_profile()))
with check (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

drop policy if exists note_operation_schedule_delete_own_active on public.note_operation_schedule_items;
create policy note_operation_schedule_delete_own_active on public.note_operation_schedule_items for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_profile()) and (select public.can_access_product('AAS-PWA-BETA')));

revoke all on table public.note_operation_profiles from public, anon, authenticated;
revoke all on table public.note_operation_schedule_items from public, anon, authenticated;
grant select, insert, update, delete on table public.note_operation_profiles to authenticated;
grant select, insert, update, delete on table public.note_operation_schedule_items to authenticated;

create or replace function private.touch_note_operation_updated_at()
returns trigger language plpgsql security definer set search_path = ''
as $function$ begin new.updated_at := now(); return new; end; $function$;
revoke all on function private.touch_note_operation_updated_at() from public, anon, authenticated;

drop trigger if exists note_operation_profiles_touch_updated_at on public.note_operation_profiles;
create trigger note_operation_profiles_touch_updated_at before update on public.note_operation_profiles
for each row execute function private.touch_note_operation_updated_at();

drop trigger if exists note_operation_schedule_touch_updated_at on public.note_operation_schedule_items;
create trigger note_operation_schedule_touch_updated_at before update on public.note_operation_schedule_items
for each row execute function private.touch_note_operation_updated_at();

create or replace function private.enforce_note_operation_schedule_limit()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare current_count integer;
begin
  perform 1 from public.profiles where id = new.user_id for update;
  select count(*) into current_count from public.note_operation_schedule_items where user_id = new.user_id;
  if current_count >= 500 then
    raise exception 'note operation schedule limit exceeded' using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function private.enforce_note_operation_schedule_limit() from public, anon, authenticated;

drop trigger if exists note_operation_schedule_limit_500 on public.note_operation_schedule_items;
create trigger note_operation_schedule_limit_500 before insert on public.note_operation_schedule_items
for each row execute function private.enforce_note_operation_schedule_limit();

comment on table public.note_operation_profiles is 'Per-user note operation setup and profile draft. Never stores note credentials, cookies, or authentication tokens.';
comment on table public.note_operation_schedule_items is 'Per-user AAS planning calendar for note operations. This does not automatically post to note.';
