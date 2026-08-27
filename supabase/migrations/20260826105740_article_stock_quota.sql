-- RECONSTRUCTED RECOVERY COPY
-- Rebuilt from the applied Phase 3 schema/RPC definitions and test records.
begin;

create table public.article_quota_settings (
    setting_key text primary key default 'default',
    default_max_articles integer not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint article_quota_settings_singleton_check
        check (setting_key = 'default'),
    constraint article_quota_settings_max_articles_check
        check (default_max_articles > 0)
);

insert into public.article_quota_settings (setting_key, default_max_articles)
values ('default', 100)
on conflict (setting_key) do update
set default_max_articles = excluded.default_max_articles;

create trigger article_quota_settings_set_updated_at
before update on public.article_quota_settings
for each row execute function private.set_updated_at();

alter table public.article_quota_settings enable row level security;
alter table public.article_quota_settings force row level security;

revoke all on table public.article_quota_settings from public, anon, authenticated;

create or replace function public.create_article(p_article jsonb default '{}'::jsonb)
returns public.articles
language plpgsql
security definer
set search_path = ''
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

    -- Serialize creates for the same user before counting.
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

revoke all on function public.create_article(jsonb) from public, anon;
grant execute on function public.create_article(jsonb) to authenticated;

create or replace function public.get_my_article_stock_summary()
returns table (
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
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_profile_role text;
    current_profile_status text;
    current_count bigint;
    max_count integer;
    publication_totals jsonb;
    status_totals jsonb;
begin
    if current_user_id is null then
        raise exception 'active profile required' using errcode = '42501';
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
        || coalesce(
            jsonb_object_agg(counts.publication_target, counts.article_count),
            '{}'::jsonb
        )
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
        ) || coalesce(
            jsonb_object_agg(counts.status, counts.article_count),
            '{}'::jsonb
        )
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

    return query select
        current_count,
        max_count,
        greatest(max_count::bigint - current_count, 0::bigint),
        false,
        publication_totals,
        status_totals;
end;
$function$;

revoke all on function public.get_my_article_stock_summary() from public, anon;
grant execute on function public.get_my_article_stock_summary() to authenticated;

commit;
