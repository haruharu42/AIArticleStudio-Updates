begin;

create table if not exists public.user_writing_profiles (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    personalization_enabled boolean not null default false,
    preferred_ai text not null default 'chatgpt'
        check (preferred_ai in ('chatgpt', 'claude', 'gemini')),
    preferred_plan text not null default 'free'
        check (preferred_plan in ('free', 'paid')),
    tone text not null default 'balanced'
        check (tone in ('balanced', 'friendly', 'professional', 'casual')),
    heading_style text not null default 'balanced'
        check (heading_style in ('balanced', 'short', 'descriptive')),
    list_preference text not null default 'balanced'
        check (list_preference in ('balanced', 'low', 'high')),
    cta_style text not null default 'balanced'
        check (cta_style in ('balanced', 'soft', 'direct')),
    avoid_hype boolean not null default true,
    preferred_platform text
        check (preferred_platform is null or preferred_platform in ('note', 'tips', 'brain', 'blog')),
    preferred_genre text
        check (preferred_genre is null or char_length(preferred_genre) between 1 and 100),
    article_count integer not null default 0 check (article_count >= 0),
    platform_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(platform_counts) = 'object'),
    genre_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(genre_counts) = 'object'),
    last_article_type text
        check (last_article_type is null or last_article_type in ('free', 'paid')),
    last_generation_mode text
        check (last_generation_mode is null or last_generation_mode in ('prompt_export', 'manual')),
    last_used_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.user_writing_profiles is
    'Small per-user prompt preferences and aggregate usage signals. Raw article bodies, AI answers, and full prompt history are not stored here.';
comment on column public.user_writing_profiles.platform_counts is
    'Aggregate counts only. No article body or prompt content.';
comment on column public.user_writing_profiles.genre_counts is
    'Aggregate counts only. No article body or prompt content.';

alter table public.user_writing_profiles enable row level security;
alter table public.user_writing_profiles force row level security;

create or replace function private.touch_user_writing_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

revoke all on function private.touch_user_writing_profile_updated_at() from public, anon, authenticated;

drop trigger if exists user_writing_profiles_touch_updated_at on public.user_writing_profiles;
create trigger user_writing_profiles_touch_updated_at
before update on public.user_writing_profiles
for each row execute function private.touch_user_writing_profile_updated_at();

create or replace function private.increment_jsonb_counter(
    p_object jsonb,
    p_key text
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
    select case
        when nullif(trim(p_key), '') is null then coalesce(p_object, '{}'::jsonb)
        else jsonb_set(
            coalesce(p_object, '{}'::jsonb),
            array[left(trim(p_key), 100)],
            to_jsonb(
                coalesce(
                    case
                        when (coalesce(p_object, '{}'::jsonb) ->> left(trim(p_key), 100)) ~ '^[0-9]+$'
                        then (coalesce(p_object, '{}'::jsonb) ->> left(trim(p_key), 100))::integer
                        else 0
                    end,
                    0
                ) + 1
            ),
            true
        )
    end;
$$;

revoke all on function private.increment_jsonb_counter(jsonb, text) from public, anon, authenticated;

drop policy if exists user_writing_profiles_select_own_active on public.user_writing_profiles;
create policy user_writing_profiles_select_own_active
on public.user_writing_profiles
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

drop policy if exists user_writing_profiles_insert_own_active on public.user_writing_profiles;
create policy user_writing_profiles_insert_own_active
on public.user_writing_profiles
for insert
to authenticated
with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

drop policy if exists user_writing_profiles_update_own_active on public.user_writing_profiles;
create policy user_writing_profiles_update_own_active
on public.user_writing_profiles
for update
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
)
with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

drop policy if exists user_writing_profiles_delete_own_active on public.user_writing_profiles;
create policy user_writing_profiles_delete_own_active
on public.user_writing_profiles
for delete
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

revoke all on table public.user_writing_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.user_writing_profiles to authenticated;

create or replace function public.record_my_personalization_signal(
    p_platform text,
    p_genre text,
    p_article_type text,
    p_generation_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_platform text := lower(nullif(trim(coalesce(p_platform, '')), ''));
    v_genre text := nullif(trim(coalesce(p_genre, '')), '');
    v_article_type text := lower(nullif(trim(coalesce(p_article_type, '')), ''));
    v_generation_mode text := lower(nullif(trim(coalesce(p_generation_mode, '')), ''));
begin
    if v_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;
    if not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if v_platform is not null and v_platform not in ('note', 'tips', 'brain', 'blog') then
        raise exception 'invalid platform' using errcode = '22023';
    end if;
    if v_genre is not null and char_length(v_genre) > 100 then
        raise exception 'genre too long' using errcode = '22023';
    end if;
    if v_article_type is not null and v_article_type not in ('free', 'paid') then
        raise exception 'invalid article type' using errcode = '22023';
    end if;
    if v_generation_mode is not null and v_generation_mode not in ('prompt_export', 'manual') then
        raise exception 'invalid generation mode' using errcode = '22023';
    end if;

    update public.user_writing_profiles
    set article_count = article_count + 1,
        platform_counts = private.increment_jsonb_counter(platform_counts, v_platform),
        genre_counts = private.increment_jsonb_counter(genre_counts, v_genre),
        last_article_type = v_article_type,
        last_generation_mode = v_generation_mode,
        last_used_at = now()
    where user_id = v_user_id
      and personalization_enabled = true;
end;
$$;

revoke all on function public.record_my_personalization_signal(text, text, text, text) from public, anon;
grant execute on function public.record_my_personalization_signal(text, text, text, text) to authenticated;

commit;
