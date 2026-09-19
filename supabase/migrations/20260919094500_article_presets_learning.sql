-- Article presets + learning signals
-- Additive PWA-only migration. Stores structured preferences, never article bodies or AI responses.

alter table public.user_writing_profiles
    add column if not exists subgenre_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(subgenre_counts) = 'object');

alter table public.user_writing_profiles
    add column if not exists article_type_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(article_type_counts) = 'object');

alter table public.user_writing_profiles
    add column if not exists age_group_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(age_group_counts) = 'object');

alter table public.user_writing_profiles
    add column if not exists target_length_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(target_length_counts) = 'object');

alter table public.user_writing_profiles
    add column if not exists preset_counts jsonb not null default '{}'::jsonb
        check (jsonb_typeof(preset_counts) = 'object');

create table if not exists public.article_presets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    publication_target text not null default 'note'
        check (publication_target in ('note', 'tips', 'brain', 'blog')),
    article_type text not null default 'free'
        check (article_type in ('free', 'paid')),
    genre text not null,
    subgenre text not null,
    age_group text not null,
    gender text not null,
    target_length integer not null
        check (target_length between 500 and 50000),
    price integer,
    affiliate_enabled boolean not null default false,
    generation_mode text not null default 'prompt_export'
        check (generation_mode in ('prompt_export', 'manual')),
    cover_enabled boolean not null default true,
    inline_enabled boolean not null default false,
    inline_count integer not null default 2
        check (inline_count between 1 and 5),
    tags text[] not null default '{}',
    is_default boolean not null default false,
    usage_count integer not null default 0 check (usage_count >= 0),
    last_used_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint article_presets_name_length check (char_length(trim(name)) between 1 and 60),
    constraint article_presets_genre_length check (char_length(trim(genre)) between 1 and 120),
    constraint article_presets_subgenre_length check (char_length(trim(subgenre)) between 1 and 120),
    constraint article_presets_age_group_length check (char_length(trim(age_group)) between 1 and 60),
    constraint article_presets_gender_length check (char_length(trim(gender)) between 1 and 60),
    constraint article_presets_price_consistency check (
        (article_type = 'free' and price is null)
        or (article_type = 'paid' and price is not null and price > 0)
    ),
    constraint article_presets_tags_limit check (cardinality(tags) <= 50)
);

create index if not exists article_presets_user_order_idx
    on public.article_presets (user_id, is_default desc, usage_count desc, last_used_at desc nulls last, updated_at desc);

create unique index if not exists article_presets_one_default_idx
    on public.article_presets (user_id)
    where is_default is true;

alter table public.article_presets enable row level security;
alter table public.article_presets force row level security;

drop policy if exists article_presets_select_own_active on public.article_presets;
create policy article_presets_select_own_active
on public.article_presets
for select
to authenticated
using (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
);

drop policy if exists article_presets_insert_own_active on public.article_presets;
create policy article_presets_insert_own_active
on public.article_presets
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
);

drop policy if exists article_presets_update_own_active on public.article_presets;
create policy article_presets_update_own_active
on public.article_presets
for update
to authenticated
using (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
)
with check (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
);

drop policy if exists article_presets_delete_own_active on public.article_presets;
create policy article_presets_delete_own_active
on public.article_presets
for delete
to authenticated
using (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
);

revoke all on table public.article_presets from public, anon, authenticated;
grant select, insert, update, delete on table public.article_presets to authenticated;

create or replace function private.touch_article_preset_updated_at()
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

revoke all on function private.touch_article_preset_updated_at() from public, anon, authenticated;

drop trigger if exists article_presets_touch_updated_at on public.article_presets;
create trigger article_presets_touch_updated_at
before update on public.article_presets
for each row execute function private.touch_article_preset_updated_at();

create or replace function private.enforce_single_default_article_preset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if new.is_default then
        update public.article_presets
        set is_default = false
        where user_id = new.user_id
          and id <> new.id
          and is_default is true;
    end if;
    return new;
end;
$function$;

revoke all on function private.enforce_single_default_article_preset() from public, anon, authenticated;

drop trigger if exists article_presets_single_default on public.article_presets;
create trigger article_presets_single_default
before insert or update of is_default on public.article_presets
for each row execute function private.enforce_single_default_article_preset();

create or replace function public.record_my_article_workflow_signal(
    p_platform text,
    p_genre text,
    p_subgenre text,
    p_article_type text,
    p_generation_mode text,
    p_age_group text,
    p_target_length integer,
    p_preset_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    platform_value text := lower(nullif(trim(coalesce(p_platform, '')), ''));
    genre_value text := nullif(trim(coalesce(p_genre, '')), '');
    subgenre_value text := nullif(trim(coalesce(p_subgenre, '')), '');
    article_type_value text := lower(nullif(trim(coalesce(p_article_type, '')), ''));
    generation_mode_value text := lower(nullif(trim(coalesce(p_generation_mode, '')), ''));
    age_group_value text := nullif(trim(coalesce(p_age_group, '')), '');
    preset_key text;
begin
    if current_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;
    if not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if platform_value not in ('note', 'tips', 'brain', 'blog') then
        raise exception 'invalid platform' using errcode = '22023';
    end if;
    if genre_value is null or char_length(genre_value) > 100 then
        raise exception 'invalid genre' using errcode = '22023';
    end if;
    if subgenre_value is null or char_length(subgenre_value) > 100 then
        raise exception 'invalid subgenre' using errcode = '22023';
    end if;
    if article_type_value not in ('free', 'paid') then
        raise exception 'invalid article type' using errcode = '22023';
    end if;
    if generation_mode_value not in ('prompt_export', 'manual') then
        raise exception 'invalid generation mode' using errcode = '22023';
    end if;
    if age_group_value is null or char_length(age_group_value) > 60 then
        raise exception 'invalid age group' using errcode = '22023';
    end if;
    if p_target_length is null or p_target_length < 500 or p_target_length > 50000 then
        raise exception 'invalid target length' using errcode = '22023';
    end if;

    if p_preset_id is not null then
        update public.article_presets
        set usage_count = usage_count + 1,
            last_used_at = now()
        where id = p_preset_id
          and user_id = current_user_id;

        if not found then
            raise exception 'article preset not found' using errcode = 'P0002';
        end if;
        preset_key := p_preset_id::text;
    end if;

    update public.user_writing_profiles
    set article_count = article_count + 1,
        platform_counts = private.increment_jsonb_counter(platform_counts, platform_value),
        genre_counts = private.increment_jsonb_counter(genre_counts, genre_value),
        subgenre_counts = private.increment_jsonb_counter(subgenre_counts, subgenre_value),
        article_type_counts = private.increment_jsonb_counter(article_type_counts, article_type_value),
        age_group_counts = private.increment_jsonb_counter(age_group_counts, age_group_value),
        target_length_counts = private.increment_jsonb_counter(target_length_counts, p_target_length::text),
        preset_counts = private.increment_jsonb_counter(preset_counts, preset_key),
        last_article_type = article_type_value,
        last_generation_mode = generation_mode_value,
        last_used_at = now()
    where user_id = current_user_id
      and personalization_enabled is true;
end;
$function$;

revoke all on function public.record_my_article_workflow_signal(text, text, text, text, text, text, integer, uuid)
from public, anon;
grant execute on function public.record_my_article_workflow_signal(text, text, text, text, text, text, integer, uuid)
to authenticated;

comment on table public.article_presets is
    'Per-user reusable article setup presets. Does not store article body, AI response, or full prompt text.';
comment on column public.user_writing_profiles.subgenre_counts is
    'Aggregate subgenre counts used only when personalization is enabled.';
comment on column public.user_writing_profiles.target_length_counts is
    'Aggregate target-length counts used only when personalization is enabled.';
