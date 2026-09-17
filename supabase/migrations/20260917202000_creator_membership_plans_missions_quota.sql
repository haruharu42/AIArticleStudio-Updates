-- Creator membership plan benefits, missions, and level-based article quota rewards.
-- Additive to the Creator foundation. Existing product access and Windows release files are unchanged.

alter table public.creator_system_settings
    add column if not exists article_quota_bonus_every_levels integer not null default 5;
alter table public.creator_system_settings
    add column if not exists article_quota_bonus_per_step integer not null default 10;
alter table public.creator_system_settings
    add column if not exists article_quota_bonus_cap integer not null default 100;

alter table public.creator_system_settings
    drop constraint if exists creator_system_settings_article_quota_bonus_every_levels_check;
alter table public.creator_system_settings
    add constraint creator_system_settings_article_quota_bonus_every_levels_check
    check (article_quota_bonus_every_levels between 1 and 100);
alter table public.creator_system_settings
    drop constraint if exists creator_system_settings_article_quota_bonus_per_step_check;
alter table public.creator_system_settings
    add constraint creator_system_settings_article_quota_bonus_per_step_check
    check (article_quota_bonus_per_step between 0 and 1000);
alter table public.creator_system_settings
    drop constraint if exists creator_system_settings_article_quota_bonus_cap_check;
alter table public.creator_system_settings
    add constraint creator_system_settings_article_quota_bonus_cap_check
    check (article_quota_bonus_cap between 0 and 10000);

insert into public.products (product_code, name, platform, status)
values
    ('AAS-NOTE-CREATOR-CLUB-PLUS', 'AAS note Creator Club Plus', 'pwa', 'active'),
    ('AAS-NOTE-CREATOR-CLUB-PRO', 'AAS note Creator Club Pro', 'pwa', 'active')
on conflict (product_code) do update set
    name = excluded.name,
    status = 'active';

create table if not exists public.creator_membership_plans (
    plan_code text primary key,
    product_code text not null unique references public.products(product_code) on delete restrict,
    display_name text not null,
    tier_rank smallint not null check (tier_rank between 1 and 100),
    badge_label text not null,
    knowledge_channel text not null references public.knowledge_refresh_channels(channel) on delete restrict,
    article_xp_multiplier numeric(5,2) not null default 1.00 check (article_xp_multiplier between 1.00 and 3.00),
    article_quota_bonus integer not null default 0 check (article_quota_bonus between 0 and 10000),
    template_tier text not null default 'member' check (template_tier ~ '^[a-z][a-z0-9_-]{0,31}$'),
    benefits jsonb not null default '{}'::jsonb check (jsonb_typeof(benefits) = 'object'),
    status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint creator_membership_plans_plan_code_check check (plan_code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
    constraint creator_membership_plans_display_name_check check (length(trim(display_name)) between 1 and 100),
    constraint creator_membership_plans_badge_label_check check (length(trim(badge_label)) between 1 and 60)
);

create unique index if not exists creator_membership_plans_active_tier_idx
    on public.creator_membership_plans (tier_rank)
    where status = 'active';

insert into public.creator_membership_plans (
    plan_code, product_code, display_name, tier_rank, badge_label,
    knowledge_channel, article_xp_multiplier, article_quota_bonus,
    template_tier, benefits, status, sort_order
)
values
    (
        'CREATOR_CLUB', 'AAS-NOTE-CREATOR-CLUB', 'Creator Club', 1, '◆ Creator Club',
        'fresh', 1.10, 25, 'member',
        jsonb_build_object(
            'knowledge', 'Fresh 48h',
            'member_missions', true,
            'priority_templates', true
        ),
        'active', 10
    ),
    (
        'CREATOR_CLUB_PLUS', 'AAS-NOTE-CREATOR-CLUB-PLUS', 'Creator Club Plus', 2, '◆ Creator Club Plus',
        'fresh', 1.20, 50, 'plus',
        jsonb_build_object(
            'knowledge', 'Fresh 48h',
            'member_missions', true,
            'plus_missions', true,
            'priority_templates', true
        ),
        'active', 20
    ),
    (
        'CREATOR_CLUB_PRO', 'AAS-NOTE-CREATOR-CLUB-PRO', 'Creator Club Pro', 3, '◆ Creator Club Pro',
        'fresh', 1.30, 100, 'pro',
        jsonb_build_object(
            'knowledge', 'Fresh 48h',
            'member_missions', true,
            'plus_missions', true,
            'pro_missions', true,
            'priority_templates', true
        ),
        'active', 30
    )
on conflict (plan_code) do update set
    product_code = excluded.product_code,
    display_name = excluded.display_name,
    tier_rank = excluded.tier_rank,
    badge_label = excluded.badge_label,
    knowledge_channel = excluded.knowledge_channel,
    article_xp_multiplier = excluded.article_xp_multiplier,
    article_quota_bonus = excluded.article_quota_bonus,
    template_tier = excluded.template_tier,
    benefits = excluded.benefits,
    status = excluded.status,
    sort_order = excluded.sort_order,
    updated_at = now();

create table if not exists public.creator_reward_wallets (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    bonus_generation_credits integer not null default 0 check (bonus_generation_credits >= 0),
    updated_at timestamptz not null default now()
);

insert into public.creator_reward_wallets (user_id)
select profile.id
from public.profiles as profile
on conflict (user_id) do nothing;

create table if not exists public.creator_mission_definitions (
    mission_code text primary key,
    title text not null,
    description text not null default '',
    cadence text not null check (cadence in ('daily', 'weekly', 'lifetime')),
    event_type text not null check (event_type in ('article_completed')),
    target_count integer not null check (target_count between 1 and 100000),
    reward_xp integer not null default 0 check (reward_xp between 0 and 1000000),
    reward_generation_credits integer not null default 0 check (reward_generation_credits between 0 and 10000),
    minimum_tier_rank smallint not null default 0 check (minimum_tier_rank between 0 and 100),
    status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint creator_mission_definitions_code_check check (mission_code ~ '^[a-z][a-z0-9_]{2,63}$'),
    constraint creator_mission_definitions_title_check check (length(trim(title)) between 1 and 120),
    constraint creator_mission_definitions_description_check check (length(description) <= 500)
);

create table if not exists public.creator_mission_progress (
    user_id uuid not null references public.profiles(id) on delete cascade,
    mission_code text not null references public.creator_mission_definitions(mission_code) on delete cascade,
    period_start date not null,
    progress integer not null default 0 check (progress >= 0),
    completed_at timestamptz,
    claimed_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (user_id, mission_code, period_start),
    constraint creator_mission_progress_claim_check check (claimed_at is null or completed_at is not null)
);

create index if not exists creator_mission_progress_user_period_idx
    on public.creator_mission_progress (user_id, period_start desc, mission_code);

insert into public.creator_mission_definitions (
    mission_code, title, description, cadence, event_type, target_count,
    reward_xp, reward_generation_credits, minimum_tier_rank, status, sort_order
)
values
    ('daily_finish_article', '今日の記事を1本完成', '下書きではなく完成条件を満たした記事を1本仕上げる', 'daily', 'article_completed', 1, 25, 0, 0, 'active', 10),
    ('weekly_finish_three', '今週の記事を3本完成', '完成条件を満たした記事を今週3本仕上げる', 'weekly', 'article_completed', 3, 100, 1, 0, 'active', 20),
    ('club_daily_finish_article', 'Creator Club デイリー', 'Creator Club限定。今日の記事を1本完成する', 'daily', 'article_completed', 1, 50, 1, 1, 'active', 30),
    ('plus_weekly_finish_five', 'Creator Club Plus チャレンジ', 'Plus以上限定。今週の記事を5本完成する', 'weekly', 'article_completed', 5, 250, 2, 2, 'active', 40),
    ('pro_weekly_finish_seven', 'Creator Club Pro チャレンジ', 'Pro限定。今週の記事を7本完成する', 'weekly', 'article_completed', 7, 500, 3, 3, 'active', 50)
on conflict (mission_code) do update set
    title = excluded.title,
    description = excluded.description,
    cadence = excluded.cadence,
    event_type = excluded.event_type,
    target_count = excluded.target_count,
    reward_xp = excluded.reward_xp,
    reward_generation_credits = excluded.reward_generation_credits,
    minimum_tier_rank = excluded.minimum_tier_rank,
    status = excluded.status,
    sort_order = excluded.sort_order,
    updated_at = now();

create or replace function private.get_creator_membership_plan(p_user_id uuid)
returns table (
    plan_code text,
    product_code text,
    display_name text,
    tier_rank smallint,
    badge_label text,
    knowledge_channel text,
    article_xp_multiplier numeric,
    article_quota_bonus integer,
    template_tier text,
    benefits jsonb,
    expires_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
    select
        plan.plan_code,
        plan.product_code,
        plan.display_name,
        plan.tier_rank,
        plan.badge_label,
        plan.knowledge_channel,
        plan.article_xp_multiplier,
        plan.article_quota_bonus,
        plan.template_tier,
        plan.benefits,
        entitlement.expires_at
    from public.creator_membership_plans as plan
    join public.products as product
      on product.product_code = plan.product_code
     and product.status = 'active'
    join public.user_entitlements as entitlement
      on entitlement.product_id = product.id
     and entitlement.user_id = p_user_id
     and entitlement.status = 'active'
     and (entitlement.expires_at is null or entitlement.expires_at > now())
    where plan.status = 'active'
    order by plan.tier_rank desc, entitlement.granted_at desc, plan.plan_code
    limit 1
$function$;

create or replace function public.has_active_creator_membership()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
    select exists (
        select 1
        from private.get_creator_membership_plan((select auth.uid()))
    )
$function$;

create or replace function private.creator_membership_tier_rank(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
    select coalesce((
        select membership.tier_rank::integer
        from private.get_creator_membership_plan(p_user_id) as membership
        limit 1
    ), 0)
$function$;

create or replace function private.creator_article_quota_bonus(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    creator_level integer := 1;
    every_levels integer := 5;
    per_step integer := 10;
    bonus_cap integer := 100;
    level_bonus integer := 0;
    membership_bonus integer := 0;
begin
    select coalesce(stats.level, 1)
    into creator_level
    from public.creator_stats as stats
    where stats.user_id = p_user_id;

    select
        settings.article_quota_bonus_every_levels,
        settings.article_quota_bonus_per_step,
        settings.article_quota_bonus_cap
    into every_levels, per_step, bonus_cap
    from public.creator_system_settings as settings
    where settings.id = 1;

    every_levels := greatest(coalesce(every_levels, 5), 1);
    per_step := greatest(coalesce(per_step, 10), 0);
    bonus_cap := greatest(coalesce(bonus_cap, 100), 0);
    level_bonus := least(bonus_cap, (greatest(creator_level, 1) / every_levels) * per_step);

    select coalesce(membership.article_quota_bonus, 0)
    into membership_bonus
    from private.get_creator_membership_plan(p_user_id) as membership
    limit 1;

    return greatest(level_bonus, 0) + greatest(coalesce(membership_bonus, 0), 0);
end;
$function$;

create or replace function private.progress_creator_missions(
    p_user_id uuid,
    p_event_type text,
    p_increment integer default 1
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    tier_rank_value integer := 0;
    increment_value integer := greatest(coalesce(p_increment, 1), 1);
begin
    tier_rank_value := (select private.creator_membership_tier_rank(p_user_id));

    insert into public.creator_mission_progress (
        user_id, mission_code, period_start, progress, completed_at, updated_at
    )
    select
        p_user_id,
        definition.mission_code,
        case definition.cadence
            when 'daily' then (now() at time zone 'Asia/Tokyo')::date
            when 'weekly' then date_trunc('week', now() at time zone 'Asia/Tokyo')::date
            else date '1970-01-01'
        end,
        least(definition.target_count, increment_value),
        case when increment_value >= definition.target_count then now() else null end,
        now()
    from public.creator_mission_definitions as definition
    where definition.status = 'active'
      and definition.event_type = p_event_type
      and definition.minimum_tier_rank <= tier_rank_value
    on conflict (user_id, mission_code, period_start)
    do update set
        progress = least(
            (select definition.target_count
             from public.creator_mission_definitions as definition
             where definition.mission_code = excluded.mission_code),
            public.creator_mission_progress.progress + excluded.progress
        ),
        completed_at = case
            when public.creator_mission_progress.completed_at is not null
                then public.creator_mission_progress.completed_at
            when public.creator_mission_progress.progress + excluded.progress >= (
                select definition.target_count
                from public.creator_mission_definitions as definition
                where definition.mission_code = excluded.mission_code
            ) then now()
            else null
        end,
        updated_at = now();
end;
$function$;

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

    insert into public.creator_reward_wallets (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$function$;

create or replace function private.track_creator_article_completion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    min_body_chars integer;
    base_xp_award integer;
    xp_award integer;
    xp_level_step integer;
    xp_multiplier numeric := 1.00;
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
    into min_body_chars, base_xp_award, xp_level_step
    from public.creator_system_settings as settings
    where settings.id = 1;

    if min_body_chars is null or base_xp_award is null or xp_level_step is null then
        return new;
    end if;

    body_chars := length(trim(coalesce(new.body, '')));
    if nullif(trim(coalesce(new.title, '')), '') is null or body_chars < min_body_chars then
        return new;
    end if;

    select coalesce(membership.article_xp_multiplier, 1.00)
    into xp_multiplier
    from private.get_creator_membership_plan(new.user_id) as membership
    limit 1;
    xp_multiplier := coalesce(xp_multiplier, 1.00);
    xp_award := greatest(1, round(base_xp_award * xp_multiplier)::integer);

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

    insert into public.creator_reward_wallets (user_id)
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

    perform private.progress_creator_missions(new.user_id, 'article_completed', 1);

    return new;
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
volatile
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    member_access boolean := false;
    knowledge_channel_value text := 'stable';
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

    insert into public.creator_reward_wallets (user_id)
    values (current_user_id)
    on conflict (user_id) do nothing;

    member_access := (select private.is_active_admin()) or (select public.has_active_creator_membership());
    if member_access then
        select coalesce(membership.knowledge_channel, 'fresh')
        into knowledge_channel_value
        from private.get_creator_membership_plan(current_user_id) as membership
        limit 1;
        knowledge_channel_value := coalesce(knowledge_channel_value, 'fresh');
    end if;

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
        knowledge_channel_value,
        channel.refresh_hours,
        channel.current_version,
        channel.last_published_at,
        (select max(snapshot.generated_at) from public.creator_ranking_snapshots as snapshot),
        settings.ranking_refresh_hours
    from public.creator_profiles as creator
    join public.creator_stats as stats on stats.user_id = creator.user_id
    cross join public.creator_system_settings as settings
    join public.knowledge_refresh_channels as channel on channel.channel = knowledge_channel_value
    where creator.user_id = current_user_id
      and settings.id = 1;
end;
$function$;

create or replace function public.get_my_creator_dashboard_v2()
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
    membership_plan_code text,
    membership_plan_name text,
    membership_tier_rank integer,
    membership_badge_label text,
    article_xp_multiplier numeric,
    membership_article_quota_bonus integer,
    creator_article_quota_bonus integer,
    template_tier text,
    knowledge_tier text,
    knowledge_refresh_hours integer,
    knowledge_version bigint,
    knowledge_last_published_at timestamptz,
    ranking_last_generated_at timestamptz,
    ranking_refresh_hours integer,
    bonus_generation_credits integer,
    available_missions integer,
    claimable_missions integer
)
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    is_admin boolean := false;
    plan_code_value text;
    plan_name_value text;
    tier_rank_value integer := 0;
    badge_label_value text;
    knowledge_channel_value text := 'stable';
    xp_multiplier_value numeric := 1.00;
    membership_quota_bonus_value integer := 0;
    template_tier_value text := 'standard';
    total_quota_bonus_value integer := 0;
    mission_available_count integer := 0;
    mission_claimable_count integer := 0;
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

    insert into public.creator_reward_wallets (user_id)
    values (current_user_id)
    on conflict (user_id) do nothing;

    is_admin := (select private.is_active_admin());

    select
        membership.plan_code,
        membership.display_name,
        membership.tier_rank::integer,
        membership.badge_label,
        membership.knowledge_channel,
        membership.article_xp_multiplier,
        membership.article_quota_bonus,
        membership.template_tier
    into
        plan_code_value,
        plan_name_value,
        tier_rank_value,
        badge_label_value,
        knowledge_channel_value,
        xp_multiplier_value,
        membership_quota_bonus_value,
        template_tier_value
    from private.get_creator_membership_plan(current_user_id) as membership
    limit 1;

    tier_rank_value := coalesce(tier_rank_value, 0);
    knowledge_channel_value := case when is_admin then 'fresh' else coalesce(knowledge_channel_value, 'stable') end;
    xp_multiplier_value := coalesce(xp_multiplier_value, 1.00);
    membership_quota_bonus_value := coalesce(membership_quota_bonus_value, 0);
    template_tier_value := coalesce(template_tier_value, 'standard');
    total_quota_bonus_value := (select private.creator_article_quota_bonus(current_user_id));

    select count(*)::integer
    into mission_available_count
    from public.creator_mission_definitions as definition
    where definition.status = 'active'
      and definition.minimum_tier_rank <= tier_rank_value;

    select count(*)::integer
    into mission_claimable_count
    from public.creator_mission_progress as progress
    join public.creator_mission_definitions as definition
      on definition.mission_code = progress.mission_code
    where progress.user_id = current_user_id
      and progress.completed_at is not null
      and progress.claimed_at is null
      and definition.status = 'active'
      and definition.minimum_tier_rank <= tier_rank_value
      and progress.period_start = case definition.cadence
          when 'daily' then (now() at time zone 'Asia/Tokyo')::date
          when 'weekly' then date_trunc('week', now() at time zone 'Asia/Tokyo')::date
          else date '1970-01-01'
      end;

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
        plan_code_value is not null,
        plan_code_value,
        plan_name_value,
        tier_rank_value,
        badge_label_value,
        xp_multiplier_value,
        membership_quota_bonus_value,
        total_quota_bonus_value,
        template_tier_value,
        knowledge_channel_value,
        channel.refresh_hours,
        channel.current_version,
        channel.last_published_at,
        (select max(snapshot.generated_at) from public.creator_ranking_snapshots as snapshot),
        settings.ranking_refresh_hours,
        wallet.bonus_generation_credits,
        mission_available_count,
        mission_claimable_count
    from public.creator_profiles as creator
    join public.creator_stats as stats on stats.user_id = creator.user_id
    join public.creator_reward_wallets as wallet on wallet.user_id = creator.user_id
    cross join public.creator_system_settings as settings
    join public.knowledge_refresh_channels as channel on channel.channel = knowledge_channel_value
    where creator.user_id = current_user_id
      and settings.id = 1;
end;
$function$;

create or replace function public.get_my_creator_missions()
returns table (
    mission_code text,
    title text,
    description text,
    cadence text,
    target_count integer,
    progress integer,
    completed boolean,
    claimed boolean,
    can_claim boolean,
    reward_xp integer,
    reward_generation_credits integer,
    minimum_tier_rank integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    tier_rank_value integer := 0;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    tier_rank_value := (select private.creator_membership_tier_rank(current_user_id));

    return query
    select
        definition.mission_code,
        definition.title,
        definition.description,
        definition.cadence,
        definition.target_count,
        least(definition.target_count, coalesce(progress.progress, 0))::integer,
        progress.completed_at is not null,
        progress.claimed_at is not null,
        progress.completed_at is not null and progress.claimed_at is null,
        definition.reward_xp,
        definition.reward_generation_credits,
        definition.minimum_tier_rank::integer
    from public.creator_mission_definitions as definition
    left join public.creator_mission_progress as progress
      on progress.user_id = current_user_id
     and progress.mission_code = definition.mission_code
     and progress.period_start = case definition.cadence
          when 'daily' then (now() at time zone 'Asia/Tokyo')::date
          when 'weekly' then date_trunc('week', now() at time zone 'Asia/Tokyo')::date
          else date '1970-01-01'
      end
    where definition.status = 'active'
      and definition.minimum_tier_rank <= tier_rank_value
    order by definition.sort_order, definition.mission_code;
end;
$function$;

create or replace function public.claim_creator_mission_reward(p_mission_code text)
returns table (
    mission_code text,
    reward_xp integer,
    reward_generation_credits integer,
    total_xp bigint,
    level integer,
    bonus_generation_credits integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    normalized_code text := lower(nullif(trim(p_mission_code), ''));
    definition public.creator_mission_definitions%rowtype;
    progress_row public.creator_mission_progress%rowtype;
    current_period_start date;
    current_tier integer := 0;
    xp_level_step integer := 500;
    local_week_start date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
    result_total_xp bigint;
    result_level integer;
    result_credits integer;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    select * into definition
    from public.creator_mission_definitions as item
    where item.mission_code = normalized_code
      and item.status = 'active';

    if not found then
        raise exception 'mission not found' using errcode = 'P0002';
    end if;

    current_tier := (select private.creator_membership_tier_rank(current_user_id));
    if definition.minimum_tier_rank > current_tier then
        raise exception 'membership tier required' using errcode = '42501';
    end if;

    current_period_start := case definition.cadence
        when 'daily' then (now() at time zone 'Asia/Tokyo')::date
        when 'weekly' then local_week_start
        else date '1970-01-01'
    end;

    select * into progress_row
    from public.creator_mission_progress as progress
    where progress.user_id = current_user_id
      and progress.mission_code = definition.mission_code
      and progress.period_start = current_period_start
    for update;

    if not found or progress_row.completed_at is null then
        raise exception 'mission not completed' using errcode = '22023';
    end if;
    if progress_row.claimed_at is not null then
        raise exception 'mission already claimed' using errcode = '22023';
    end if;

    update public.creator_mission_progress as progress
    set claimed_at = now(), updated_at = now()
    where progress.user_id = current_user_id
      and progress.mission_code = definition.mission_code
      and progress.period_start = current_period_start;

    insert into public.creator_stats (user_id)
    values (current_user_id)
    on conflict (user_id) do nothing;

    insert into public.creator_reward_wallets (user_id)
    values (current_user_id)
    on conflict (user_id) do nothing;

    select settings.xp_per_level
    into xp_level_step
    from public.creator_system_settings as settings
    where settings.id = 1;
    xp_level_step := greatest(coalesce(xp_level_step, 500), 1);

    update public.creator_stats as stats
    set
        total_xp = stats.total_xp + definition.reward_xp,
        level = 1 + ((stats.total_xp + definition.reward_xp) / xp_level_step)::integer,
        weekly_xp = case
            when stats.weekly_period_start = local_week_start then stats.weekly_xp + definition.reward_xp
            else definition.reward_xp
        end,
        weekly_period_start = local_week_start,
        updated_at = now()
    where stats.user_id = current_user_id
    returning stats.total_xp, stats.level into result_total_xp, result_level;

    update public.creator_reward_wallets as wallet
    set
        bonus_generation_credits = wallet.bonus_generation_credits + definition.reward_generation_credits,
        updated_at = now()
    where wallet.user_id = current_user_id
    returning wallet.bonus_generation_credits into result_credits;

    return query select
        definition.mission_code,
        definition.reward_xp,
        definition.reward_generation_credits,
        result_total_xp,
        result_level,
        result_credits;
end;
$function$;

create or replace function public.list_my_creator_membership_plans()
returns table (
    plan_code text,
    display_name text,
    tier_rank integer,
    badge_label text,
    knowledge_channel text,
    knowledge_refresh_hours integer,
    article_xp_multiplier numeric,
    article_quota_bonus integer,
    template_tier text,
    benefits jsonb,
    is_current boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_plan_code text;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select membership.plan_code
    into current_plan_code
    from private.get_creator_membership_plan(current_user_id) as membership
    limit 1;

    return query
    select
        plan.plan_code,
        plan.display_name,
        plan.tier_rank::integer,
        plan.badge_label,
        plan.knowledge_channel,
        channel.refresh_hours,
        plan.article_xp_multiplier,
        plan.article_quota_bonus,
        plan.template_tier,
        plan.benefits,
        plan.plan_code = current_plan_code
    from public.creator_membership_plans as plan
    join public.knowledge_refresh_channels as channel on channel.channel = plan.knowledge_channel
    where plan.status = 'active'
    order by plan.sort_order, plan.tier_rank;
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

    member_access := (select private.is_active_admin()) or (select public.has_active_creator_membership());

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

create or replace function public.create_article(p_article jsonb default '{}'::jsonb)
returns public.articles
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_profile_role text;
    current_profile_status text;
    article_payload jsonb := coalesce(p_article, '{}'::jsonb);
    publication_value text;
    article_type_value text;
    article_status_value text;
    article_price_value bigint;
    article_tags_value text[];
    max_articles_value integer;
    current_articles_value bigint;
    creator_bonus_value integer := 0;
    created_article public.articles%rowtype;
begin
    if current_user_id is null then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if jsonb_typeof(article_payload) <> 'object' then
        raise exception 'article payload must be an object' using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_object_keys(article_payload) as supplied(key)
        where not supplied.key = any (array[
            'title', 'publication_target', 'article_type', 'genre', 'subgenre',
            'body', 'status', 'price', 'tags', 'scheduled_at', 'published_at',
            'published_url'
        ])
    ) then
        raise exception 'article payload contains unsupported fields' using errcode = '22023';
    end if;

    publication_value := case lower(trim(coalesce(article_payload ->> 'publication_target', 'note')))
        when 'ブログ' then 'blog'
        else lower(trim(coalesce(article_payload ->> 'publication_target', 'note')))
    end;

    article_type_value := case lower(trim(coalesce(article_payload ->> 'article_type', 'free')))
        when '無料' then 'free'
        when '有料' then 'paid'
        else lower(trim(coalesce(article_payload ->> 'article_type', 'free')))
    end;

    article_status_value := lower(trim(coalesce(article_payload ->> 'status', 'draft')));
    article_tags_value := private.normalize_article_tags(article_payload -> 'tags');

    article_price_value := case
        when not (article_payload ? 'price')
          or article_payload -> 'price' = 'null'::jsonb
          or nullif(trim(article_payload ->> 'price'), '') is null
        then null
        else (article_payload ->> 'price')::bigint
    end;

    select profile.role, profile.status
    into current_profile_role, current_profile_status
    from public.profiles as profile
    where profile.id = current_user_id
    for update;

    if not found or current_profile_status <> 'active' then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if current_profile_role = 'user' then
        select quota.default_max_articles
        into max_articles_value
        from public.article_quota_settings as quota
        where quota.setting_key = 'default';

        if max_articles_value is null then
            raise exception using
                errcode = 'P0001',
                message = 'article_quota_configuration_missing';
        end if;

        creator_bonus_value := (select private.creator_article_quota_bonus(current_user_id));
        max_articles_value := max_articles_value + greatest(coalesce(creator_bonus_value, 0), 0);

        select count(*)
        into current_articles_value
        from public.articles as article
        where article.user_id = current_user_id;

        if current_articles_value >= max_articles_value then
            raise exception using
                errcode = 'P0001',
                message = 'article_quota_exceeded',
                detail = format(
                    'current_articles=%s,max_articles=%s',
                    current_articles_value,
                    max_articles_value
                );
        end if;
    elsif current_profile_role <> 'admin' then
        raise exception 'unsupported profile role' using errcode = '42501';
    end if;

    insert into public.articles (
        user_id,
        title,
        publication_target,
        article_type,
        genre,
        subgenre,
        body,
        status,
        price,
        tags,
        scheduled_at,
        published_at,
        published_url
    ) values (
        current_user_id,
        coalesce(article_payload ->> 'title', ''),
        publication_value,
        article_type_value,
        nullif(trim(article_payload ->> 'genre'), ''),
        nullif(trim(article_payload ->> 'subgenre'), ''),
        coalesce(article_payload ->> 'body', ''),
        article_status_value,
        article_price_value,
        article_tags_value,
        case
            when article_payload -> 'scheduled_at' is null
              or article_payload -> 'scheduled_at' = 'null'::jsonb
              or nullif(trim(article_payload ->> 'scheduled_at'), '') is null
            then null
            else (article_payload ->> 'scheduled_at')::timestamptz
        end,
        case
            when article_payload -> 'published_at' is null
              or article_payload -> 'published_at' = 'null'::jsonb
              or nullif(trim(article_payload ->> 'published_at'), '') is null
            then null
            else (article_payload ->> 'published_at')::timestamptz
        end,
        nullif(trim(article_payload ->> 'published_url'), '')
    )
    returning * into created_article;

    return created_article;
end;
$function$;

create or replace function public.get_my_article_stock_summary()
returns table(
    current_articles bigint,
    max_articles integer,
    remaining_articles bigint,
    is_unlimited boolean,
    publication_counts jsonb,
    status_counts jsonb
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_profile_role text;
    current_profile_status text;
    current_count bigint;
    max_count integer;
    creator_bonus_value integer := 0;
    publication_totals jsonb;
    status_totals jsonb;
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required'
            using errcode = '42501';
    end if;

    select profile.role, profile.status
    into current_profile_role, current_profile_status
    from public.profiles as profile
    where profile.id = current_user_id;

    if not found or current_profile_status <> 'active' then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if current_profile_role not in ('user', 'admin') then
        raise exception 'unsupported profile role' using errcode = '42501';
    end if;

    select count(*)
    into current_count
    from public.articles as article
    where article.user_id = current_user_id;

    select
        jsonb_build_object('note', 0, 'tips', 0, 'brain', 0, 'blog', 0)
        || coalesce(jsonb_object_agg(counts.publication_target, counts.article_count), '{}'::jsonb)
    into publication_totals
    from (
        select article.publication_target, count(*) as article_count
        from public.articles as article
        where article.user_id = current_user_id
        group by article.publication_target
    ) as counts;

    select
        jsonb_build_object(
            'draft', 0,
            'writing', 0,
            'ready', 0,
            'waiting_publish', 0,
            'published', 0,
            'on_hold', 0,
            'archived', 0
        ) || coalesce(jsonb_object_agg(counts.status, counts.article_count), '{}'::jsonb)
    into status_totals
    from (
        select article.status, count(*) as article_count
        from public.articles as article
        where article.user_id = current_user_id
        group by article.status
    ) as counts;

    if current_profile_role = 'admin' then
        return query select
            current_count,
            null::integer,
            null::bigint,
            true,
            publication_totals,
            status_totals;
        return;
    end if;

    select quota.default_max_articles
    into max_count
    from public.article_quota_settings as quota
    where quota.setting_key = 'default';

    if max_count is null then
        raise exception using
            errcode = 'P0001',
            message = 'article_quota_configuration_missing';
    end if;

    creator_bonus_value := (select private.creator_article_quota_bonus(current_user_id));
    max_count := max_count + greatest(coalesce(creator_bonus_value, 0), 0);

    return query select
        current_count,
        max_count,
        greatest(max_count::bigint - current_count, 0::bigint),
        false,
        publication_totals,
        status_totals;
end;
$function$;

alter table public.creator_membership_plans enable row level security;
alter table public.creator_reward_wallets enable row level security;
alter table public.creator_mission_definitions enable row level security;
alter table public.creator_mission_progress enable row level security;

revoke all on table public.creator_membership_plans from anon, authenticated;
revoke all on table public.creator_reward_wallets from anon, authenticated;
revoke all on table public.creator_mission_definitions from anon, authenticated;
revoke all on table public.creator_mission_progress from anon, authenticated;

revoke all on function private.get_creator_membership_plan(uuid) from public, anon, authenticated;
revoke all on function private.creator_membership_tier_rank(uuid) from public, anon, authenticated;
revoke all on function private.creator_article_quota_bonus(uuid) from public, anon, authenticated;
revoke all on function private.progress_creator_missions(uuid, text, integer) from public, anon, authenticated;
revoke all on function private.ensure_creator_account() from public, anon, authenticated;
revoke all on function private.track_creator_article_completion() from public, anon, authenticated;

revoke all on function public.has_active_creator_membership() from public, anon;
revoke all on function public.get_my_creator_dashboard_v2() from public, anon;
revoke all on function public.get_my_creator_missions() from public, anon;
revoke all on function public.claim_creator_mission_reward(text) from public, anon;
revoke all on function public.list_my_creator_membership_plans() from public, anon;

grant execute on function public.has_active_creator_membership() to authenticated;
grant execute on function public.get_my_creator_dashboard_v2() to authenticated;
grant execute on function public.get_my_creator_missions() to authenticated;
grant execute on function public.claim_creator_mission_reward(text) to authenticated;
grant execute on function public.list_my_creator_membership_plans() to authenticated;
grant execute on function public.get_my_creator_dashboard() to authenticated;
grant execute on function public.list_my_active_knowledge_catalog() to authenticated;

-- Enforce plan-aware Fresh access for legacy direct catalog readers too.
drop policy if exists knowledge_catalog_select_active_or_admin on public.knowledge_catalog;
create policy knowledge_catalog_select_active_or_admin
on public.knowledge_catalog
for select
to authenticated
using (
    (select private.is_active_admin())
    or (
        (select private.is_active_profile())
        and status = 'active'
        and (
            release_channel = 'both'
            or stable_available_at <= now()
            or (select public.has_active_creator_membership())
        )
    )
);
