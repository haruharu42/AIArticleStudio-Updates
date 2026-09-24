-- platform account designs for note / Tips / Brain
-- Remote migration: 20260920080324 platform_account_designs

create table if not exists public.platform_account_designs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('note','tips','brain')),
  genre_preset text not null default 'ai'
    check (genre_preset in ('ai','sidejob','business','lifestyle','gadget','learning','parenting','health_beauty','money','creative','entertainment','other')),
  custom_genre text not null default '',
  account_style_preset text not null default 'beginner'
    check (account_style_preset in ('beginner','howto','experience','essay','review','trend','expert','creative','community','other')),
  custom_account_style text not null default '',
  audience_preset text not null default 'beginner'
    check (audience_preset in ('beginner','employee','sidejob_beginner','student','parent','senior','creator','business_owner','broad','other')),
  custom_audience text not null default '',
  tone_preset text not null default 'friendly'
    check (tone_preset in ('friendly','gentle','professional','casual','expert','energetic','other')),
  custom_tone text not null default '',
  monetization_preset text not null default 'free_to_paid'
    check (monetization_preset in ('free_first','free_to_paid','paid_expertise','digital_product','service_lead','membership_future','no_monetization','other')),
  custom_monetization text not null default '',
  goal_preset text not null default 'growth'
    check (goal_preset in ('habit','growth','monetize','authority','portfolio','other')),
  custom_goal text not null default '',
  trust_preset text not null default 'experience'
    check (trust_preset in ('experience','expertise','process','research','curation','templates','community','other')),
  custom_trust text not null default '',
  content_focus_preset text not null default 'howto'
    check (content_focus_preset in ('howto','case_study','comparison','review','trend','essay','templates','course','creative','other')),
  custom_content_focus text not null default '',
  display_name text not null default '',
  profile_draft text not null default '',
  experience_note text not null default '',
  main_topics text[] not null default '{}',
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform),
  constraint platform_account_designs_custom_lengths check (
    char_length(custom_genre) <= 120
    and char_length(custom_account_style) <= 180
    and char_length(custom_audience) <= 300
    and char_length(custom_tone) <= 120
    and char_length(custom_monetization) <= 180
    and char_length(custom_goal) <= 180
    and char_length(custom_trust) <= 180
    and char_length(custom_content_focus) <= 180
  ),
  constraint platform_account_designs_detail_lengths check (
    char_length(display_name) <= 120
    and char_length(profile_draft) <= 1200
    and char_length(experience_note) <= 1200
    and cardinality(main_topics) <= 12
    and pg_column_size(main_topics) <= 8192
  )
);

alter table public.platform_account_designs enable row level security;
alter table public.platform_account_designs force row level security;

drop policy if exists platform_account_designs_select_own_active on public.platform_account_designs;
create policy platform_account_designs_select_own_active
on public.platform_account_designs for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_designs_insert_own_active on public.platform_account_designs;
create policy platform_account_designs_insert_own_active
on public.platform_account_designs for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

drop policy if exists platform_account_designs_update_own_active on public.platform_account_designs;
create policy platform_account_designs_update_own_active
on public.platform_account_designs for update to authenticated
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

drop policy if exists platform_account_designs_delete_own_active on public.platform_account_designs;
create policy platform_account_designs_delete_own_active
on public.platform_account_designs for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
  and (select public.can_access_product('AAS-PWA-BETA'))
);

revoke all on table public.platform_account_designs from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_account_designs to authenticated;

create or replace function private.touch_platform_account_design_updated_at()
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

revoke all on function private.touch_platform_account_design_updated_at() from public, anon, authenticated;

drop trigger if exists platform_account_designs_touch_updated_at on public.platform_account_designs;
create trigger platform_account_designs_touch_updated_at
before update on public.platform_account_designs
for each row execute function private.touch_platform_account_design_updated_at();

insert into public.platform_account_designs (
  user_id, platform, genre_preset, custom_genre, account_style_preset,
  custom_account_style, audience_preset, custom_audience, tone_preset,
  custom_tone, monetization_preset, custom_monetization, goal_preset,
  display_name, profile_draft, experience_note, main_topics, ready
)
select
  p.user_id, 'note', p.account_genre, p.custom_genre, p.account_style,
  p.custom_account_style, p.audience_preset, p.custom_audience, p.tone_preset,
  p.custom_tone, p.monetization_style, p.custom_monetization_style, p.operation_goal,
  p.note_display_name, p.bio_draft, p.experience_note, p.main_topics, p.profile_ready
from public.note_operation_profiles p
on conflict (user_id, platform) do nothing;

comment on table public.platform_account_designs is
  'Per-user account design settings for note, Tips, and Brain. Stores planning preferences only; never platform passwords, cookies, access tokens, or authentication codes.';
