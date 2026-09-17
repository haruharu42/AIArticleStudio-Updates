begin;

create table public.free_trial_settings (
    id smallint primary key default 1,
    enabled boolean not null default true,
    duration_days integer not null default 7,
    daily_total_limit integer not null default 5,
    article_generate_limit integer not null default 3,
    title_generate_limit integer not null default 5,
    article_rewrite_limit integer not null default 3,
    sns_generate_limit integer not null default 5,
    image_generate_limit integer not null default 1,
    ai_assist_limit integer not null default 5,
    reset_timezone text not null default 'Asia/Tokyo',
    reset_hour integer not null default 0,
    auto_start_on_activation boolean not null default true,
    new_users_only boolean not null default true,
    eligible_from timestamptz not null default now(),
    apply_duration_changes_to_active boolean not null default false,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint free_trial_settings_singleton_check check (id = 1),
    constraint free_trial_settings_duration_check check (duration_days between 1 and 365),
    constraint free_trial_settings_daily_total_check check (daily_total_limit between 0 and 10000),
    constraint free_trial_settings_article_generate_check check (article_generate_limit between 0 and 10000),
    constraint free_trial_settings_title_generate_check check (title_generate_limit between 0 and 10000),
    constraint free_trial_settings_article_rewrite_check check (article_rewrite_limit between 0 and 10000),
    constraint free_trial_settings_sns_generate_check check (sns_generate_limit between 0 and 10000),
    constraint free_trial_settings_image_generate_check check (image_generate_limit between 0 and 10000),
    constraint free_trial_settings_ai_assist_check check (ai_assist_limit between 0 and 10000),
    constraint free_trial_settings_reset_hour_check check (reset_hour between 0 and 23),
    constraint free_trial_settings_timezone_check check (length(trim(reset_timezone)) between 1 and 100)
);

insert into public.free_trial_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.free_trial_settings enable row level security;
alter table public.free_trial_settings force row level security;
revoke all on table public.free_trial_settings from public, anon, authenticated;

create table public.user_free_trials (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    status text not null default 'active',
    source text not null default 'auto',
    started_at timestamptz not null default now(),
    ends_at timestamptz not null,
    duration_days_at_start integer not null,
    stopped_at timestamptz,
    stopped_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_free_trials_status_check check (status in ('active', 'stopped')),
    constraint user_free_trials_source_check check (source in ('auto', 'admin')),
    constraint user_free_trials_duration_check check (duration_days_at_start between 1 and 365),
    constraint user_free_trials_end_check check (ends_at > started_at)
);

create index user_free_trials_status_end_idx
    on public.user_free_trials (status, ends_at);

alter table public.user_free_trials enable row level security;
alter table public.user_free_trials force row level security;
revoke all on table public.user_free_trials from public, anon, authenticated;

create table public.free_trial_daily_usage (
    user_id uuid not null references public.user_free_trials(user_id) on delete cascade,
    usage_date date not null,
    feature text not null,
    use_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, usage_date, feature),
    constraint free_trial_daily_usage_feature_check check (
        feature in (
            'article_generate',
            'title_generate',
            'article_rewrite',
            'sns_generate',
            'image_generate',
            'ai_assist'
        )
    ),
    constraint free_trial_daily_usage_count_check check (use_count between 0 and 100000)
);

create index free_trial_daily_usage_day_idx
    on public.free_trial_daily_usage (usage_date, user_id);

alter table public.free_trial_daily_usage enable row level security;
alter table public.free_trial_daily_usage force row level security;
revoke all on table public.free_trial_daily_usage from public, anon, authenticated;

create trigger free_trial_settings_set_updated_at
before update on public.free_trial_settings
for each row execute function private.set_updated_at();

create trigger user_free_trials_set_updated_at
before update on public.user_free_trials
for each row execute function private.set_updated_at();

create trigger free_trial_daily_usage_set_updated_at
before update on public.free_trial_daily_usage
for each row execute function private.set_updated_at();

create or replace function private.free_trial_usage_date()
returns date
language sql
stable
security definer
set search_path = ''
as $function$
    select (
        (clock_timestamp() at time zone settings.reset_timezone)
        - make_interval(hours => settings.reset_hour)
    )::date
    from public.free_trial_settings as settings
    where settings.id = 1;
$function$;

revoke all on function private.free_trial_usage_date() from public, anon, authenticated;

create or replace function private.has_active_product_entitlement(
    p_user_id uuid,
    p_product_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select exists (
        select 1
        from public.user_entitlements as entitlement
        join public.products as product on product.id = entitlement.product_id
        where entitlement.user_id = p_user_id
          and product.product_code = upper(nullif(trim(p_product_code), ''))
          and product.status = 'active'
          and entitlement.status = 'active'
          and (entitlement.expires_at is null or entitlement.expires_at > now())
    );
$function$;

revoke all on function private.has_active_product_entitlement(uuid, text) from public, anon, authenticated;

create or replace function private.start_free_trial_if_eligible(
    p_user_id uuid,
    p_manual boolean default false,
    p_duration_days integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    settings public.free_trial_settings%rowtype;
    profile_role text;
    profile_status text;
    profile_created_at timestamptz;
    duration integer;
    started timestamptz := now();
begin
    select * into settings
    from public.free_trial_settings
    where id = 1;

    if not found or settings.enabled is not true then
        return false;
    end if;

    select profile.role, profile.status, profile.created_at
    into profile_role, profile_status, profile_created_at
    from public.profiles as profile
    where profile.id = p_user_id;

    if not found or profile_role <> 'user' or profile_status <> 'active' then
        return false;
    end if;

    if exists (select 1 from public.user_free_trials as trial where trial.user_id = p_user_id) then
        return false;
    end if;

    if (select private.has_active_product_entitlement(p_user_id, 'AAS-PWA-BETA')) then
        return false;
    end if;

    if not p_manual then
        if settings.auto_start_on_activation is not true then
            return false;
        end if;
        if settings.new_users_only and profile_created_at < settings.eligible_from then
            return false;
        end if;
    end if;

    duration := coalesce(p_duration_days, settings.duration_days);
    if duration < 1 or duration > 365 then
        raise exception 'invalid trial duration' using errcode = '22023';
    end if;

    insert into public.user_free_trials (
        user_id,
        status,
        source,
        started_at,
        ends_at,
        duration_days_at_start
    ) values (
        p_user_id,
        'active',
        case when p_manual then 'admin' else 'auto' end,
        started,
        started + make_interval(days => duration),
        duration
    );

    return true;
end;
$function$;

revoke all on function private.start_free_trial_if_eligible(uuid, boolean, integer) from public, anon, authenticated;

create or replace function private.auto_start_free_trial_on_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if new.status = 'active'
       and new.role = 'user'
       and (
           tg_op = 'INSERT'
           or old.status is distinct from new.status
           or old.role is distinct from new.role
       ) then
        perform private.start_free_trial_if_eligible(new.id, false, null);
    end if;
    return new;
end;
$function$;

revoke all on function private.auto_start_free_trial_on_profile_activation() from public, anon, authenticated;

drop trigger if exists profiles_auto_start_free_trial on public.profiles;
create trigger profiles_auto_start_free_trial
after insert or update of status, role on public.profiles
for each row execute function private.auto_start_free_trial_on_profile_activation();

create or replace function public.ensure_my_free_trial()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
begin
    if current_user_id is null then
        return false;
    end if;
    return private.start_free_trial_if_eligible(current_user_id, false, null);
end;
$function$;

revoke all on function public.ensure_my_free_trial() from public, anon;
grant execute on function public.ensure_my_free_trial() to authenticated;

create or replace function public.can_access_product(p_product_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    requested_product_code text := upper(nullif(trim(p_product_code), ''));
begin
    if current_user_id is null or requested_product_code is null then
        return false;
    end if;

    return exists (
        select 1
        from public.profiles as profile
        join public.products as product
          on product.product_code = requested_product_code
         and product.status = 'active'
        where profile.id = current_user_id
          and profile.status = 'active'
          and (
              profile.role = 'admin'
              or (
                  profile.role = 'user'
                  and (
                      (select private.has_active_product_entitlement(profile.id, requested_product_code))
                      or (
                          requested_product_code = 'AAS-PWA-BETA'
                          and exists (
                              select 1
                              from public.free_trial_settings as settings
                              join public.user_free_trials as trial on trial.user_id = profile.id
                              where settings.id = 1
                                and settings.enabled is true
                                and trial.status = 'active'
                                and trial.ends_at > now()
                          )
                      )
                  )
              )
          )
    );
end;
$function$;

revoke all on function public.can_access_product(text) from public, anon;
grant execute on function public.can_access_product(text) to authenticated;

create or replace function public.get_my_free_trial_status()
returns table (
    program_enabled boolean,
    trial_eligible boolean,
    trial_status text,
    started_at timestamptz,
    ends_at timestamptz,
    remaining_days integer,
    usage_date date,
    total_used integer,
    daily_total_limit integer,
    article_generate_used integer,
    article_generate_limit integer,
    title_generate_used integer,
    title_generate_limit integer,
    article_rewrite_used integer,
    article_rewrite_limit integer,
    sns_generate_used integer,
    sns_generate_limit integer,
    image_generate_used integer,
    image_generate_limit integer,
    ai_assist_used integer,
    ai_assist_limit integer,
    reset_timezone text,
    reset_hour integer,
    bypass_limits boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    settings public.free_trial_settings%rowtype;
    profile_role text;
    profile_status text;
    profile_created_at timestamptz;
    trial public.user_free_trials%rowtype;
    has_trial boolean := false;
    has_paid_access boolean := false;
    current_usage_date date;
    v_total integer := 0;
    v_article integer := 0;
    v_title integer := 0;
    v_rewrite integer := 0;
    v_sns integer := 0;
    v_image integer := 0;
    v_assist integer := 0;
    computed_status text := 'not_started';
    computed_remaining integer := null;
begin
    if current_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;

    select * into settings from public.free_trial_settings where id = 1;
    select profile.role, profile.status, profile.created_at
      into profile_role, profile_status, profile_created_at
      from public.profiles as profile
     where profile.id = current_user_id;

    if not found then
        raise exception 'profile not found' using errcode = 'P0002';
    end if;

    select * into trial
      from public.user_free_trials as item
     where item.user_id = current_user_id;
    has_trial := found;
    has_paid_access := private.has_active_product_entitlement(current_user_id, 'AAS-PWA-BETA');
    current_usage_date := private.free_trial_usage_date();

    select
        coalesce(sum(usage.use_count), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'article_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'title_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'article_rewrite'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'sns_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'image_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'ai_assist'), 0)::integer
    into v_total, v_article, v_title, v_rewrite, v_sns, v_image, v_assist
    from public.free_trial_daily_usage as usage
    where usage.user_id = current_user_id
      and usage.usage_date = current_usage_date;

    if profile_role = 'admin' then
        computed_status := 'admin';
    elsif has_paid_access then
        computed_status := 'paid';
    elsif has_trial and trial.status = 'stopped' then
        computed_status := 'stopped';
    elsif has_trial and trial.ends_at <= now() then
        computed_status := 'expired';
    elsif has_trial and trial.status = 'active' and settings.enabled then
        computed_status := 'active';
        computed_remaining := greatest(0, ceil(extract(epoch from (trial.ends_at - now())) / 86400.0)::integer);
    elsif has_trial then
        computed_status := 'disabled';
    end if;

    return query select
        settings.enabled,
        (
            profile_role = 'user'
            and profile_status = 'active'
            and settings.enabled
            and (not settings.new_users_only or profile_created_at >= settings.eligible_from)
        ),
        computed_status,
        case when has_trial then trial.started_at else null end,
        case when has_trial then trial.ends_at else null end,
        computed_remaining,
        current_usage_date,
        v_total,
        settings.daily_total_limit,
        v_article,
        settings.article_generate_limit,
        v_title,
        settings.title_generate_limit,
        v_rewrite,
        settings.article_rewrite_limit,
        v_sns,
        settings.sns_generate_limit,
        v_image,
        settings.image_generate_limit,
        v_assist,
        settings.ai_assist_limit,
        settings.reset_timezone,
        settings.reset_hour,
        (profile_role = 'admin' or has_paid_access);
end;
$function$;

revoke all on function public.get_my_free_trial_status() from public, anon;
grant execute on function public.get_my_free_trial_status() to authenticated;

create or replace function public.consume_free_trial_usage(p_feature text)
returns table (
    allowed boolean,
    bypass_limits boolean,
    reason text,
    usage_date date,
    total_used integer,
    daily_total_limit integer,
    feature_used integer,
    feature_limit integer,
    remaining integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    normalized_feature text := lower(nullif(trim(p_feature), ''));
    settings public.free_trial_settings%rowtype;
    trial public.user_free_trials%rowtype;
    profile_role text;
    profile_status text;
    current_usage_date date;
    current_total integer := 0;
    current_feature integer := 0;
    selected_limit integer := 0;
begin
    if current_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;

    if normalized_feature not in (
        'article_generate', 'title_generate', 'article_rewrite',
        'sns_generate', 'image_generate', 'ai_assist'
    ) then
        raise exception 'invalid trial feature' using errcode = '22023';
    end if;

    select profile.role, profile.status
      into profile_role, profile_status
      from public.profiles as profile
     where profile.id = current_user_id;

    if not found or profile_status <> 'active' then
        return query select false, false, 'inactive_account'::text, null::date, 0, 0, 0, 0, 0;
        return;
    end if;

    current_usage_date := private.free_trial_usage_date();

    if profile_role = 'admin'
       or private.has_active_product_entitlement(current_user_id, 'AAS-PWA-BETA') then
        return query select true, true, 'bypass'::text, current_usage_date, 0, 0, 0, 0, 0;
        return;
    end if;

    select * into settings
      from public.free_trial_settings
     where id = 1;

    if not found or settings.enabled is not true then
        return query select false, false, 'trial_disabled'::text, current_usage_date, 0, coalesce(settings.daily_total_limit, 0), 0, 0, 0;
        return;
    end if;

    select * into trial
      from public.user_free_trials as item
     where item.user_id = current_user_id
     for update;

    if not found then
        return query select false, false, 'no_trial'::text, current_usage_date, 0, settings.daily_total_limit, 0, 0, 0;
        return;
    end if;
    if trial.status <> 'active' then
        return query select false, false, 'trial_stopped'::text, current_usage_date, 0, settings.daily_total_limit, 0, 0, 0;
        return;
    end if;
    if trial.ends_at <= now() then
        return query select false, false, 'trial_expired'::text, current_usage_date, 0, settings.daily_total_limit, 0, 0, 0;
        return;
    end if;

    selected_limit := case normalized_feature
        when 'article_generate' then settings.article_generate_limit
        when 'title_generate' then settings.title_generate_limit
        when 'article_rewrite' then settings.article_rewrite_limit
        when 'sns_generate' then settings.sns_generate_limit
        when 'image_generate' then settings.image_generate_limit
        when 'ai_assist' then settings.ai_assist_limit
        else 0
    end;

    select
        coalesce(sum(usage.use_count), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = normalized_feature), 0)::integer
      into current_total, current_feature
      from public.free_trial_daily_usage as usage
     where usage.user_id = current_user_id
       and usage.usage_date = current_usage_date;

    if settings.daily_total_limit <= current_total then
        return query select false, false, 'daily_limit'::text, current_usage_date, current_total, settings.daily_total_limit, current_feature, selected_limit, 0;
        return;
    end if;
    if selected_limit <= current_feature then
        return query select false, false, 'feature_limit'::text, current_usage_date, current_total, settings.daily_total_limit, current_feature, selected_limit, 0;
        return;
    end if;

    insert into public.free_trial_daily_usage (user_id, usage_date, feature, use_count)
    values (current_user_id, current_usage_date, normalized_feature, 1)
    on conflict (user_id, usage_date, feature)
    do update set use_count = public.free_trial_daily_usage.use_count + 1;

    current_total := current_total + 1;
    current_feature := current_feature + 1;

    return query select
        true,
        false,
        'allowed'::text,
        current_usage_date,
        current_total,
        settings.daily_total_limit,
        current_feature,
        selected_limit,
        greatest(0, least(settings.daily_total_limit - current_total, selected_limit - current_feature));
end;
$function$;

revoke all on function public.consume_free_trial_usage(text) from public, anon;
grant execute on function public.consume_free_trial_usage(text) to authenticated;

create or replace function public.admin_get_free_trial_settings()
returns table (
    enabled boolean,
    duration_days integer,
    daily_total_limit integer,
    article_generate_limit integer,
    title_generate_limit integer,
    article_rewrite_limit integer,
    sns_generate_limit integer,
    image_generate_limit integer,
    ai_assist_limit integer,
    reset_timezone text,
    reset_hour integer,
    auto_start_on_activation boolean,
    new_users_only boolean,
    eligible_from timestamptz,
    apply_duration_changes_to_active boolean,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    return query
    select
        settings.enabled,
        settings.duration_days,
        settings.daily_total_limit,
        settings.article_generate_limit,
        settings.title_generate_limit,
        settings.article_rewrite_limit,
        settings.sns_generate_limit,
        settings.image_generate_limit,
        settings.ai_assist_limit,
        settings.reset_timezone,
        settings.reset_hour,
        settings.auto_start_on_activation,
        settings.new_users_only,
        settings.eligible_from,
        settings.apply_duration_changes_to_active,
        settings.updated_at
    from public.free_trial_settings as settings
    where settings.id = 1;
end;
$function$;

revoke all on function public.admin_get_free_trial_settings() from public, anon;
grant execute on function public.admin_get_free_trial_settings() to authenticated;

create or replace function public.admin_update_free_trial_settings(
    p_enabled boolean,
    p_duration_days integer,
    p_daily_total_limit integer,
    p_article_generate_limit integer,
    p_title_generate_limit integer,
    p_article_rewrite_limit integer,
    p_sns_generate_limit integer,
    p_image_generate_limit integer,
    p_ai_assist_limit integer,
    p_reset_timezone text,
    p_reset_hour integer,
    p_auto_start_on_activation boolean,
    p_new_users_only boolean,
    p_eligible_from timestamptz,
    p_apply_duration_changes_to_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
    normalized_timezone text := nullif(trim(p_reset_timezone), '');
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if p_duration_days not between 1 and 365
       or p_daily_total_limit not between 0 and 10000
       or p_article_generate_limit not between 0 and 10000
       or p_title_generate_limit not between 0 and 10000
       or p_article_rewrite_limit not between 0 and 10000
       or p_sns_generate_limit not between 0 and 10000
       or p_image_generate_limit not between 0 and 10000
       or p_ai_assist_limit not between 0 and 10000
       or p_reset_hour not between 0 and 23
       or p_eligible_from is null then
        raise exception 'invalid free trial settings' using errcode = '22023';
    end if;

    if normalized_timezone is null
       or not exists (select 1 from pg_catalog.pg_timezone_names where name = normalized_timezone) then
        raise exception 'invalid reset timezone' using errcode = '22023';
    end if;

    update public.free_trial_settings
       set enabled = p_enabled,
           duration_days = p_duration_days,
           daily_total_limit = p_daily_total_limit,
           article_generate_limit = p_article_generate_limit,
           title_generate_limit = p_title_generate_limit,
           article_rewrite_limit = p_article_rewrite_limit,
           sns_generate_limit = p_sns_generate_limit,
           image_generate_limit = p_image_generate_limit,
           ai_assist_limit = p_ai_assist_limit,
           reset_timezone = normalized_timezone,
           reset_hour = p_reset_hour,
           auto_start_on_activation = p_auto_start_on_activation,
           new_users_only = p_new_users_only,
           eligible_from = p_eligible_from,
           apply_duration_changes_to_active = p_apply_duration_changes_to_active,
           updated_by = (select auth.uid())
     where id = 1;

    if p_apply_duration_changes_to_active then
        update public.user_free_trials
           set ends_at = started_at + make_interval(days => p_duration_days),
               duration_days_at_start = p_duration_days
         where status = 'active';
    end if;
end;
$function$;

revoke all on function public.admin_update_free_trial_settings(boolean, integer, integer, integer, integer, integer, integer, integer, integer, text, integer, boolean, boolean, timestamptz, boolean) from public, anon;
grant execute on function public.admin_update_free_trial_settings(boolean, integer, integer, integer, integer, integer, integer, integer, integer, text, integer, boolean, boolean, timestamptz, boolean) to authenticated;

create or replace function public.admin_get_user_free_trial(p_target_user_id uuid)
returns table (
    has_trial boolean,
    trial_status text,
    source text,
    started_at timestamptz,
    ends_at timestamptz,
    usage_date date,
    total_used integer,
    daily_total_limit integer,
    article_generate_used integer,
    article_generate_limit integer,
    title_generate_used integer,
    title_generate_limit integer,
    article_rewrite_used integer,
    article_rewrite_limit integer,
    sns_generate_used integer,
    sns_generate_limit integer,
    image_generate_used integer,
    image_generate_limit integer,
    ai_assist_used integer,
    ai_assist_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    settings public.free_trial_settings%rowtype;
    trial public.user_free_trials%rowtype;
    trial_found boolean := false;
    current_usage_date date;
    v_total integer := 0;
    v_article integer := 0;
    v_title integer := 0;
    v_rewrite integer := 0;
    v_sns integer := 0;
    v_image integer := 0;
    v_assist integer := 0;
    computed_status text := 'not_started';
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if not exists (select 1 from public.profiles as profile where profile.id = p_target_user_id) then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;

    select * into settings from public.free_trial_settings where id = 1;
    select * into trial from public.user_free_trials as item where item.user_id = p_target_user_id;
    trial_found := found;
    current_usage_date := private.free_trial_usage_date();

    select
        coalesce(sum(usage.use_count), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'article_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'title_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'article_rewrite'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'sns_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'image_generate'), 0)::integer,
        coalesce(sum(usage.use_count) filter (where usage.feature = 'ai_assist'), 0)::integer
      into v_total, v_article, v_title, v_rewrite, v_sns, v_image, v_assist
      from public.free_trial_daily_usage as usage
     where usage.user_id = p_target_user_id
       and usage.usage_date = current_usage_date;

    if trial_found then
        computed_status := case
            when trial.status = 'stopped' then 'stopped'
            when trial.ends_at <= now() then 'expired'
            else 'active'
        end;
    end if;

    return query select
        trial_found,
        computed_status,
        case when trial_found then trial.source else null end,
        case when trial_found then trial.started_at else null end,
        case when trial_found then trial.ends_at else null end,
        current_usage_date,
        v_total,
        settings.daily_total_limit,
        v_article,
        settings.article_generate_limit,
        v_title,
        settings.title_generate_limit,
        v_rewrite,
        settings.article_rewrite_limit,
        v_sns,
        settings.sns_generate_limit,
        v_image,
        settings.image_generate_limit,
        v_assist,
        settings.ai_assist_limit;
end;
$function$;

revoke all on function public.admin_get_user_free_trial(uuid) from public, anon;
grant execute on function public.admin_get_user_free_trial(uuid) to authenticated;

create or replace function public.admin_start_user_free_trial(
    p_target_user_id uuid,
    p_duration_days integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
    started boolean;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if exists (select 1 from public.user_free_trials as trial where trial.user_id = p_target_user_id) then
        raise exception 'trial already exists' using errcode = '23505';
    end if;

    started := private.start_free_trial_if_eligible(p_target_user_id, true, p_duration_days);
    if not started then
        raise exception 'trial cannot be started' using errcode = '22023';
    end if;
end;
$function$;

revoke all on function public.admin_start_user_free_trial(uuid, integer) from public, anon;
grant execute on function public.admin_start_user_free_trial(uuid, integer) to authenticated;

create or replace function public.admin_update_user_free_trial(
    p_target_user_id uuid,
    p_status text,
    p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
    normalized_status text := lower(nullif(trim(p_status), ''));
    trial_started_at timestamptz;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if normalized_status not in ('active', 'stopped') or p_ends_at is null then
        raise exception 'invalid trial update' using errcode = '22023';
    end if;

    select trial.started_at into trial_started_at
      from public.user_free_trials as trial
     where trial.user_id = p_target_user_id
     for update;

    if not found then
        raise exception 'trial not found' using errcode = 'P0002';
    end if;
    if p_ends_at <= trial_started_at then
        raise exception 'trial end must be after start' using errcode = '22023';
    end if;
    if normalized_status = 'active' and p_ends_at <= now() then
        raise exception 'active trial end must be in the future' using errcode = '22023';
    end if;

    update public.user_free_trials
       set status = normalized_status,
           ends_at = p_ends_at,
           stopped_at = case when normalized_status = 'stopped' then now() else null end,
           stopped_by = case when normalized_status = 'stopped' then (select auth.uid()) else null end
     where user_id = p_target_user_id;
end;
$function$;

revoke all on function public.admin_update_user_free_trial(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_update_user_free_trial(uuid, text, timestamptz) to authenticated;

create or replace function public.admin_reset_user_free_trial_usage(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    delete from public.free_trial_daily_usage
     where user_id = p_target_user_id
       and usage_date = private.free_trial_usage_date();
end;
$function$;

revoke all on function public.admin_reset_user_free_trial_usage(uuid) from public, anon;
grant execute on function public.admin_reset_user_free_trial_usage(uuid) to authenticated;

commit;
