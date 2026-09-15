alter table public.free_trial_daily_usage
    drop constraint if exists free_trial_daily_usage_user_id_fkey;

alter table public.free_trial_daily_usage
    add constraint free_trial_daily_usage_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

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
                              where settings.id = 1
                                and settings.enabled is true
                                and (
                                    (
                                        settings.permanent_daily_free_enabled is true
                                        and not exists (
                                            select 1
                                            from public.user_free_trials as stopped_trial
                                            where stopped_trial.user_id = profile.id
                                              and stopped_trial.status = 'stopped'
                                        )
                                    )
                                    or exists (
                                        select 1
                                        from public.user_free_trials as timed_trial
                                        where timed_trial.user_id = profile.id
                                          and timed_trial.status = 'active'
                                          and timed_trial.ends_at > now()
                                    )
                                )
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
    elsif profile_role = 'user'
       and profile_status = 'active'
       and settings.enabled
       and settings.permanent_daily_free_enabled then
        computed_status := 'active';
    elsif has_trial and trial.status = 'active' and settings.enabled and trial.ends_at > now() then
        computed_status := 'active';
        computed_remaining := greatest(0, ceil(extract(epoch from (trial.ends_at - now())) / 86400.0)::integer);
    elsif has_trial and trial.ends_at <= now() then
        computed_status := 'expired';
    elsif has_trial then
        computed_status := 'disabled';
    end if;

    return query select
        settings.enabled,
        (
            profile_role = 'user'
            and profile_status = 'active'
            and settings.enabled
            and (
                settings.permanent_daily_free_enabled
                or not settings.new_users_only
                or profile_created_at >= settings.eligible_from
            )
        ),
        computed_status,
        case when has_trial then trial.started_at else null end,
        case when has_trial and not settings.permanent_daily_free_enabled then trial.ends_at else null end,
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
    has_trial boolean := false;
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
     where profile.id = current_user_id
     for update;

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
     where item.user_id = current_user_id;
    has_trial := found;

    if has_trial and trial.status <> 'active' then
        return query select false, false, 'trial_stopped'::text, current_usage_date, 0, settings.daily_total_limit, 0, 0, 0;
        return;
    end if;

    if not settings.permanent_daily_free_enabled then
        if not has_trial then
            return query select false, false, 'no_trial'::text, current_usage_date, 0, settings.daily_total_limit, 0, 0, 0;
            return;
        end if;
        if trial.ends_at <= now() then
            return query select false, false, 'trial_expired'::text, current_usage_date, 0, settings.daily_total_limit, 0, 0, 0;
            return;
        end if;
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
