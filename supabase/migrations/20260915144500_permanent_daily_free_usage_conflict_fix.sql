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
    on conflict on constraint free_trial_daily_usage_pkey
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
