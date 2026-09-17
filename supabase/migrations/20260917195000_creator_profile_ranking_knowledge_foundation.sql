-- Creator profile / ranking / knowledge tier foundation
-- Additive PWA-only migration. Windows article schema and release flow remain unchanged.

create table if not exists public.creator_system_settings (
    id smallint primary key default 1 check (id = 1),
    ranking_refresh_hours integer not null default 12 check (ranking_refresh_hours between 1 and 168),
    stable_knowledge_refresh_hours integer not null default 168 check (stable_knowledge_refresh_hours between 1 and 720),
    fresh_knowledge_refresh_hours integer not null default 48 check (fresh_knowledge_refresh_hours between 1 and 720),
    completion_min_body_chars integer not null default 300 check (completion_min_body_chars between 1 and 10000),
    xp_per_completed_article integer not null default 100 check (xp_per_completed_article between 1 and 100000),
    xp_per_level integer not null default 500 check (xp_per_level between 1 and 1000000),
    updated_at timestamptz not null default now()
);

insert into public.creator_system_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.creator_profiles (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    public_name text,
    bio text not null default '',
    avatar_url text,
    favorite_genre text,
    creator_goal text,
    ranking_opt_in boolean not null default false,
    show_level boolean not null default true,
    show_completed_articles boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint creator_profiles_public_name_length check (public_name is null or length(trim(public_name)) between 1 and 40),
    constraint creator_profiles_bio_length check (length(bio) <= 300),
    constraint creator_profiles_avatar_url_length check (avatar_url is null or length(avatar_url) <= 2048),
    constraint creator_profiles_favorite_genre_length check (favorite_genre is null or length(favorite_genre) <= 120),
    constraint creator_profiles_creator_goal_length check (creator_goal is null or length(creator_goal) <= 200)
);

create table if not exists public.creator_stats (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    total_xp bigint not null default 0 check (total_xp >= 0),
    level integer not null default 1 check (level >= 1),
    completed_articles integer not null default 0 check (completed_articles >= 0),
    completed_magazines integer not null default 0 check (completed_magazines >= 0),
    weekly_xp bigint not null default 0 check (weekly_xp >= 0),
    weekly_period_start date,
    current_streak integer not null default 0 check (current_streak >= 0),
    best_streak integer not null default 0 check (best_streak >= 0),
    last_activity_date date,
    last_article_completed_at timestamptz,
    updated_at timestamptz not null default now()
);

-- One immutable row per article prevents ready -> draft -> ready and later edits
-- from incrementing completion totals more than once.
create table if not exists public.creator_article_completions (
    article_id uuid primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    first_completed_at timestamptz not null default now(),
    body_char_count integer not null check (body_char_count >= 0),
    awarded_xp integer not null check (awarded_xp >= 0)
);

create index if not exists creator_article_completions_user_time_idx
    on public.creator_article_completions (user_id, first_completed_at desc);

create table if not exists public.creator_ranking_snapshots (
    ranking_key text not null check (ranking_key in ('level', 'completed_articles', 'weekly_xp')),
    rank_position integer not null check (rank_position >= 1),
    user_id uuid not null references public.profiles(id) on delete cascade,
    metric_value bigint not null check (metric_value >= 0),
    generated_at timestamptz not null,
    primary key (ranking_key, user_id),
    unique (ranking_key, rank_position)
);

create index if not exists creator_ranking_snapshots_lookup_idx
    on public.creator_ranking_snapshots (ranking_key, rank_position);

-- Existing knowledge catalog remains the source of prompt rules. These channel
-- columns make fresh-first releases possible without duplicating the catalog.
alter table public.knowledge_catalog
    add column if not exists release_channel text not null default 'both';

alter table public.knowledge_catalog
    add column if not exists stable_available_at timestamptz not null default now();

alter table public.knowledge_catalog
    drop constraint if exists knowledge_catalog_release_channel_check;

alter table public.knowledge_catalog
    add constraint knowledge_catalog_release_channel_check
    check (release_channel in ('both', 'fresh_first'));

create table if not exists public.knowledge_refresh_channels (
    channel text primary key check (channel in ('stable', 'fresh')),
    refresh_hours integer not null check (refresh_hours between 1 and 720),
    current_version bigint not null default 1 check (current_version >= 1),
    last_published_at timestamptz not null default now(),
    last_refresh_requested_at timestamptz,
    next_refresh_due_at timestamptz not null,
    updated_at timestamptz not null default now()
);

insert into public.knowledge_refresh_channels (
    channel, refresh_hours, next_refresh_due_at
)
values
    ('stable', 168, now() + interval '168 hours'),
    ('fresh', 48, now() + interval '48 hours')
on conflict (channel) do update set
    refresh_hours = excluded.refresh_hours;

create table if not exists public.knowledge_refresh_requests (
    id bigint generated always as identity primary key,
    channel text not null references public.knowledge_refresh_channels(channel) on delete cascade,
    requested_at timestamptz not null default now(),
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    completed_at timestamptz,
    error_message text,
    constraint knowledge_refresh_requests_error_length check (error_message is null or length(error_message) <= 1000)
);

create unique index if not exists knowledge_refresh_requests_one_pending_idx
    on public.knowledge_refresh_requests (channel)
    where status in ('pending', 'processing');

create index if not exists knowledge_refresh_requests_status_time_idx
    on public.knowledge_refresh_requests (status, requested_at);

-- note membership is represented as a normal PWA entitlement so the existing
-- admin grant/revoke RPCs can manage it now and a redemption flow can reuse it later.
insert into public.products (product_code, name, platform, status)
values ('AAS-NOTE-CREATOR-CLUB', 'AAS note Creator Club', 'pwa', 'active')
on conflict (product_code) do update set
    name = excluded.name,
    status = 'active';

-- Seed creator records for existing accounts. Ranking is opt-in by default.
insert into public.creator_profiles (user_id, public_name)
select profile.id, nullif(trim(profile.display_name), '')
from public.profiles as profile
on conflict (user_id) do nothing;

insert into public.creator_stats (user_id)
select profile.id
from public.profiles as profile
on conflict (user_id) do nothing;

create or replace function private.ensure_creator_account()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    insert into public.creator_profiles (user_id, public_name)
    values (new.id, nullif(trim(new.display_name), ''))
    on conflict (user_id) do nothing;

    insert into public.creator_stats (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$function$;

drop trigger if exists trg_profiles_ensure_creator_account on public.profiles;
create trigger trg_profiles_ensure_creator_account
after insert on public.profiles
for each row execute function private.ensure_creator_account();

create or replace function private.track_creator_article_completion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    min_body_chars integer;
    xp_award integer;
    xp_level_step integer;
    body_chars integer;
    local_today date := (now() at time zone 'Asia/Tokyo')::date;
    local_week_start date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
    inserted_article_id uuid;
begin
    if new.status not in ('ready', 'waiting_publish', 'published') then
        return new;
    end if;

    select
        settings.completion_min_body_chars,
        settings.xp_per_completed_article,
        settings.xp_per_level
    into min_body_chars, xp_award, xp_level_step
    from public.creator_system_settings as settings
    where settings.id = 1;

    if min_body_chars is null or xp_award is null or xp_level_step is null then
        return new;
    end if;

    body_chars := length(trim(coalesce(new.body, '')));
    if nullif(trim(coalesce(new.title, '')), '') is null or body_chars < min_body_chars then
        return new;
    end if;

    insert into public.creator_article_completions (
        article_id, user_id, first_completed_at, body_char_count, awarded_xp
    ) values (
        new.id, new.user_id, now(), body_chars, xp_award
    )
    on conflict (article_id) do nothing
    returning article_id into inserted_article_id;

    if inserted_article_id is null then
        return new;
    end if;

    insert into public.creator_profiles (user_id, public_name)
    select profile.id, nullif(trim(profile.display_name), '')
    from public.profiles as profile
    where profile.id = new.user_id
    on conflict (user_id) do nothing;

    insert into public.creator_stats (user_id)
    values (new.user_id)
    on conflict (user_id) do nothing;

    update public.creator_stats as stats
    set
        total_xp = stats.total_xp + xp_award,
        level = 1 + ((stats.total_xp + xp_award) / xp_level_step)::integer,
        completed_articles = stats.completed_articles + 1,
        weekly_xp = case
            when stats.weekly_period_start = local_week_start then stats.weekly_xp + xp_award
            else xp_award
        end,
        weekly_period_start = local_week_start,
        current_streak = case
            when stats.last_activity_date = local_today then stats.current_streak
            when stats.last_activity_date = local_today - 1 then stats.current_streak + 1
            else 1
        end,
        best_streak = greatest(
            stats.best_streak,
            case
                when stats.last_activity_date = local_today then stats.current_streak
                when stats.last_activity_date = local_today - 1 then stats.current_streak + 1
                else 1
            end
        ),
        last_activity_date = local_today,
        last_article_completed_at = now(),
        updated_at = now()
    where stats.user_id = new.user_id;

    return new;
end;
$function$;

drop trigger if exists trg_articles_track_creator_completion on public.articles;
create trigger trg_articles_track_creator_completion
after insert or update of title, body, status on public.articles
for each row execute function private.track_creator_article_completion();

-- Backfill already-completed articles once. The ledger makes this idempotent.
with settings as (
    select completion_min_body_chars, xp_per_completed_article
    from public.creator_system_settings
    where id = 1
)
insert into public.creator_article_completions (
    article_id, user_id, first_completed_at, body_char_count, awarded_xp
)
select
    article.id,
    article.user_id,
    coalesce(article.published_at, article.updated_at, article.created_at),
    length(trim(coalesce(article.body, ''))),
    settings.xp_per_completed_article
from public.articles as article
cross join settings
where article.status in ('ready', 'waiting_publish', 'published')
  and nullif(trim(coalesce(article.title, '')), '') is not null
  and length(trim(coalesce(article.body, ''))) >= settings.completion_min_body_chars
on conflict (article_id) do nothing;

with settings as (
    select xp_per_level
    from public.creator_system_settings
    where id = 1
), totals as (
    select
        completion.user_id,
        count(*)::integer as completed_articles,
        coalesce(sum(completion.awarded_xp), 0)::bigint as total_xp,
        coalesce(sum(completion.awarded_xp) filter (
            where completion.first_completed_at >= date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
        ), 0)::bigint as weekly_xp,
        max(completion.first_completed_at) as last_completed_at
    from public.creator_article_completions as completion
    group by completion.user_id
)
update public.creator_stats as stats
set
    completed_articles = totals.completed_articles,
    total_xp = totals.total_xp,
    level = 1 + (totals.total_xp / settings.xp_per_level)::integer,
    weekly_xp = totals.weekly_xp,
    weekly_period_start = date_trunc('week', now() at time zone 'Asia/Tokyo')::date,
    current_streak = case when totals.completed_articles > 0 then greatest(stats.current_streak, 1) else stats.current_streak end,
    best_streak = case when totals.completed_articles > 0 then greatest(stats.best_streak, 1) else stats.best_streak end,
    last_activity_date = case when totals.last_completed_at is null then stats.last_activity_date else (totals.last_completed_at at time zone 'Asia/Tokyo')::date end,
    last_article_completed_at = totals.last_completed_at,
    updated_at = now()
from totals, settings
where stats.user_id = totals.user_id;

create or replace function private.refresh_creator_rankings()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    generated_time timestamptz := now();
    local_week_start date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
begin
    if not pg_try_advisory_xact_lock(hashtext('aas.creator.rankings')) then
        return;
    end if;

    update public.creator_stats
    set weekly_xp = 0,
        weekly_period_start = local_week_start,
        updated_at = now()
    where weekly_period_start is distinct from local_week_start;

    delete from public.creator_ranking_snapshots;

    insert into public.creator_ranking_snapshots (
        ranking_key, rank_position, user_id, metric_value, generated_at
    )
    select 'level', ranked.rank_position, ranked.user_id, ranked.metric_value, generated_time
    from (
        select
            stats.user_id,
            stats.level::bigint as metric_value,
            row_number() over (
                order by stats.level desc, stats.total_xp desc, stats.completed_articles desc, stats.user_id
            )::integer as rank_position
        from public.creator_stats as stats
        join public.creator_profiles as creator on creator.user_id = stats.user_id
        join public.profiles as profile on profile.id = stats.user_id
        where creator.ranking_opt_in is true
          and nullif(trim(creator.public_name), '') is not null
          and profile.status = 'active'
    ) as ranked
    where ranked.rank_position <= 500;

    insert into public.creator_ranking_snapshots (
        ranking_key, rank_position, user_id, metric_value, generated_at
    )
    select 'completed_articles', ranked.rank_position, ranked.user_id, ranked.metric_value, generated_time
    from (
        select
            stats.user_id,
            stats.completed_articles::bigint as metric_value,
            row_number() over (
                order by stats.completed_articles desc, stats.total_xp desc, stats.level desc, stats.user_id
            )::integer as rank_position
        from public.creator_stats as stats
        join public.creator_profiles as creator on creator.user_id = stats.user_id
        join public.profiles as profile on profile.id = stats.user_id
        where creator.ranking_opt_in is true
          and creator.show_completed_articles is true
          and nullif(trim(creator.public_name), '') is not null
          and profile.status = 'active'
    ) as ranked
    where ranked.rank_position <= 500;

    insert into public.creator_ranking_snapshots (
        ranking_key, rank_position, user_id, metric_value, generated_at
    )
    select 'weekly_xp', ranked.rank_position, ranked.user_id, ranked.metric_value, generated_time
    from (
        select
            stats.user_id,
            stats.weekly_xp::bigint as metric_value,
            row_number() over (
                order by stats.weekly_xp desc, stats.total_xp desc, stats.completed_articles desc, stats.user_id
            )::integer as rank_position
        from public.creator_stats as stats
        join public.creator_profiles as creator on creator.user_id = stats.user_id
        join public.profiles as profile on profile.id = stats.user_id
        where creator.ranking_opt_in is true
          and nullif(trim(creator.public_name), '') is not null
          and profile.status = 'active'
    ) as ranked
    where ranked.rank_position <= 500;
end;
$function$;

create or replace function private.enqueue_due_knowledge_refreshes()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
    insert into public.knowledge_refresh_requests (channel)
    select channel.channel
    from public.knowledge_refresh_channels as channel
    where channel.next_refresh_due_at <= now()
      and not exists (
          select 1
          from public.knowledge_refresh_requests as request
          where request.channel = channel.channel
            and request.status in ('pending', 'processing')
      )
    on conflict do nothing;

    update public.knowledge_refresh_channels as channel
    set
        last_refresh_requested_at = now(),
        next_refresh_due_at = now() + make_interval(hours => channel.refresh_hours),
        updated_at = now()
    where channel.next_refresh_due_at <= now()
      and exists (
          select 1
          from public.knowledge_refresh_requests as request
          where request.channel = channel.channel
            and request.status in ('pending', 'processing')
      );
end;
$function$;

create or replace function public.get_my_creator_dashboard()
returns table (
    public_name text,
    bio text,
    avatar_url text,
    favorite_genre text,
    creator_goal text,
    ranking_opt_in boolean,
    show_level boolean,
    show_completed_articles boolean,
    total_xp bigint,
    level integer,
    completed_articles integer,
    completed_magazines integer,
    weekly_xp bigint,
    current_streak integer,
    best_streak integer,
    note_member boolean,
    knowledge_tier text,
    knowledge_refresh_hours integer,
    knowledge_version bigint,
    knowledge_last_published_at timestamptz,
    ranking_last_generated_at timestamptz,
    ranking_refresh_hours integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    member_access boolean := false;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    insert into public.creator_profiles (user_id, public_name)
    select profile.id, nullif(trim(profile.display_name), '')
    from public.profiles as profile
    where profile.id = current_user_id
    on conflict (user_id) do nothing;

    insert into public.creator_stats (user_id)
    values (current_user_id)
    on conflict (user_id) do nothing;

    member_access := (select public.can_access_product('AAS-NOTE-CREATOR-CLUB'));

    return query
    select
        creator.public_name,
        creator.bio,
        creator.avatar_url,
        creator.favorite_genre,
        creator.creator_goal,
        creator.ranking_opt_in,
        creator.show_level,
        creator.show_completed_articles,
        stats.total_xp,
        stats.level,
        stats.completed_articles,
        stats.completed_magazines,
        stats.weekly_xp,
        stats.current_streak,
        stats.best_streak,
        member_access,
        case when member_access then 'fresh' else 'stable' end,
        channel.refresh_hours,
        channel.current_version,
        channel.last_published_at,
        (select max(snapshot.generated_at) from public.creator_ranking_snapshots as snapshot),
        settings.ranking_refresh_hours
    from public.creator_profiles as creator
    join public.creator_stats as stats on stats.user_id = creator.user_id
    cross join public.creator_system_settings as settings
    join public.knowledge_refresh_channels as channel
      on channel.channel = case when member_access then 'fresh' else 'stable' end
    where creator.user_id = current_user_id
      and settings.id = 1;
end;
$function$;

create or replace function public.update_my_creator_profile(p_patch jsonb)
returns table (
    public_name text,
    bio text,
    avatar_url text,
    favorite_genre text,
    creator_goal text,
    ranking_opt_in boolean,
    show_level boolean,
    show_completed_articles boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    patch jsonb := coalesce(p_patch, '{}'::jsonb);
    next_public_name text;
    next_ranking_opt_in boolean;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    if jsonb_typeof(patch) <> 'object' or patch = '{}'::jsonb then
        raise exception 'profile patch must be a non-empty object' using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_object_keys(patch) as supplied(key)
        where not supplied.key = any (array[
            'public_name', 'bio', 'avatar_url', 'favorite_genre', 'creator_goal',
            'ranking_opt_in', 'show_level', 'show_completed_articles'
        ])
    ) then
        raise exception 'profile patch contains unsupported fields' using errcode = '22023';
    end if;

    insert into public.creator_profiles (user_id, public_name)
    select profile.id, nullif(trim(profile.display_name), '')
    from public.profiles as profile
    where profile.id = current_user_id
    on conflict (user_id) do nothing;

    select
        case when patch ? 'public_name' then nullif(trim(patch ->> 'public_name'), '') else creator.public_name end,
        case when patch ? 'ranking_opt_in' then coalesce((patch ->> 'ranking_opt_in')::boolean, false) else creator.ranking_opt_in end
    into next_public_name, next_ranking_opt_in
    from public.creator_profiles as creator
    where creator.user_id = current_user_id;

    if next_public_name is not null and length(next_public_name) > 40 then
        raise exception 'public name is too long' using errcode = '22023';
    end if;
    if next_ranking_opt_in and next_public_name is null then
        raise exception 'public name is required for ranking participation' using errcode = '22023';
    end if;

    update public.creator_profiles as creator
    set
        public_name = next_public_name,
        bio = case when patch ? 'bio' then left(coalesce(patch ->> 'bio', ''), 300) else creator.bio end,
        avatar_url = case when patch ? 'avatar_url' then nullif(trim(patch ->> 'avatar_url'), '') else creator.avatar_url end,
        favorite_genre = case when patch ? 'favorite_genre' then nullif(left(trim(patch ->> 'favorite_genre'), 120), '') else creator.favorite_genre end,
        creator_goal = case when patch ? 'creator_goal' then nullif(left(trim(patch ->> 'creator_goal'), 200), '') else creator.creator_goal end,
        ranking_opt_in = next_ranking_opt_in,
        show_level = case when patch ? 'show_level' then coalesce((patch ->> 'show_level')::boolean, true) else creator.show_level end,
        show_completed_articles = case when patch ? 'show_completed_articles' then coalesce((patch ->> 'show_completed_articles')::boolean, true) else creator.show_completed_articles end,
        updated_at = now()
    where creator.user_id = current_user_id;

    return query
    select
        creator.public_name,
        creator.bio,
        creator.avatar_url,
        creator.favorite_genre,
        creator.creator_goal,
        creator.ranking_opt_in,
        creator.show_level,
        creator.show_completed_articles
    from public.creator_profiles as creator
    where creator.user_id = current_user_id;
end;
$function$;

create or replace function public.get_creator_ranking(
    p_ranking_key text default 'level',
    p_limit integer default 50
)
returns table (
    ranking_key text,
    rank_position integer,
    public_name text,
    avatar_url text,
    level integer,
    completed_articles integer,
    weekly_xp bigint,
    metric_value bigint,
    is_me boolean,
    generated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    key_value text := lower(trim(coalesce(p_ranking_key, 'level')));
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    if key_value not in ('level', 'completed_articles', 'weekly_xp') then
        raise exception 'invalid ranking key' using errcode = '22023';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 100 then
        raise exception 'invalid ranking limit' using errcode = '22023';
    end if;

    return query
    select
        snapshot.ranking_key,
        snapshot.rank_position,
        creator.public_name,
        creator.avatar_url,
        case when creator.show_level then stats.level else null end,
        case when creator.show_completed_articles then stats.completed_articles else null end,
        stats.weekly_xp,
        snapshot.metric_value,
        snapshot.user_id = current_user_id,
        snapshot.generated_at
    from public.creator_ranking_snapshots as snapshot
    join public.creator_profiles as creator on creator.user_id = snapshot.user_id
    join public.creator_stats as stats on stats.user_id = snapshot.user_id
    where snapshot.ranking_key = key_value
      and creator.ranking_opt_in is true
      and nullif(trim(creator.public_name), '') is not null
    order by snapshot.rank_position
    limit p_limit;
end;
$function$;

create or replace function public.list_my_active_knowledge_catalog()
returns table (
    key text,
    kind text,
    label text,
    parent_label text,
    aliases text[],
    guidance text[],
    deliverables text[],
    cautions text[],
    tasks text[],
    priority smallint,
    status text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    member_access boolean := false;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    member_access := (select public.can_access_product('AAS-NOTE-CREATOR-CLUB'));

    return query
    select
        catalog.key,
        catalog.kind,
        catalog.label,
        catalog.parent_label,
        catalog.aliases,
        catalog.guidance,
        catalog.deliverables,
        catalog.cautions,
        catalog.tasks,
        catalog.priority,
        catalog.status
    from public.knowledge_catalog as catalog
    where catalog.status = 'active'
      and (
          catalog.release_channel = 'both'
          or member_access
          or catalog.stable_available_at <= now()
      )
    order by catalog.priority desc, catalog.key
    limit 500;
end;
$function$;

-- Direct table access is unnecessary; expose only narrow RPCs.
alter table public.creator_system_settings enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.creator_stats enable row level security;
alter table public.creator_article_completions enable row level security;
alter table public.creator_ranking_snapshots enable row level security;
alter table public.knowledge_refresh_channels enable row level security;
alter table public.knowledge_refresh_requests enable row level security;

revoke all on table public.creator_system_settings from anon, authenticated;
revoke all on table public.creator_profiles from anon, authenticated;
revoke all on table public.creator_stats from anon, authenticated;
revoke all on table public.creator_article_completions from anon, authenticated;
revoke all on table public.creator_ranking_snapshots from anon, authenticated;
revoke all on table public.knowledge_refresh_channels from anon, authenticated;
revoke all on table public.knowledge_refresh_requests from anon, authenticated;

grant execute on function public.get_my_creator_dashboard() to authenticated;
grant execute on function public.update_my_creator_profile(jsonb) to authenticated;
grant execute on function public.get_creator_ranking(text, integer) to authenticated;
grant execute on function public.list_my_active_knowledge_catalog() to authenticated;

-- Initial snapshot is intentionally empty until users opt in.
select private.refresh_creator_rankings();

-- pg_cron uses UTC: 03:00/15:00 UTC = 12:00/00:00 JST.
do $block$
declare
    existing_job_id bigint;
begin
    select jobid into existing_job_id
    from cron.job
    where jobname = 'aas_creator_rankings_12h'
    limit 1;
    if existing_job_id is not null then
        perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
        'aas_creator_rankings_12h',
        '0 3,15 * * *',
        'select private.refresh_creator_rankings();'
    );

    existing_job_id := null;
    select jobid into existing_job_id
    from cron.job
    where jobname = 'aas_knowledge_refresh_queue_hourly'
    limit 1;
    if existing_job_id is not null then
        perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
        'aas_knowledge_refresh_queue_hourly',
        '17 * * * *',
        'select private.enqueue_due_knowledge_refreshes();'
    );
end;
$block$;
