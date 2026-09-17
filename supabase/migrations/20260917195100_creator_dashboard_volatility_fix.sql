-- get_my_creator_dashboard ensures missing per-user rows, so it must remain VOLATILE.
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

grant execute on function public.get_my_creator_dashboard() to authenticated;
