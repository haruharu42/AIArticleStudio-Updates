-- RECONSTRUCTED RECOVERY COPY
-- Rebuilt from the applied schema and Phase 2 records.
-- Phase 3 quota logic and Phase 4 article-assets delete guard are deliberately absent here;
-- later migrations add those changes.
begin;

create or replace function private.normalize_article_tags(p_tags jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $function$
declare
    normalized_tags text[];
begin
    if p_tags is null or p_tags = 'null'::jsonb then
        return '{}'::text[];
    end if;

    if jsonb_typeof(p_tags) <> 'array' then
        raise exception 'tags must be an array' using errcode = '22023';
    end if;

    if jsonb_array_length(p_tags) > 50 then
        raise exception 'too many tags' using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(p_tags) as tag(value)
        where jsonb_typeof(tag.value) <> 'string'
    ) then
        raise exception 'tags must contain strings only' using errcode = '22023';
    end if;

    select coalesce(
        array_agg(trim(tag.value) order by tag.ordinality),
        '{}'::text[]
    )
    into normalized_tags
    from jsonb_array_elements_text(p_tags) with ordinality as tag(value, ordinality);

    if exists (
        select 1
        from unnest(normalized_tags) as tag(value)
        where length(tag.value) not between 1 and 100
    ) then
        raise exception 'invalid tag length' using errcode = '22023';
    end if;

    return normalized_tags;
end;
$function$;

revoke all on function private.normalize_article_tags(jsonb)
from public, anon, authenticated;

create or replace function private.bump_article_revision()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
    if new.id <> old.id or new.user_id <> old.user_id then
        raise exception 'article identity cannot be changed' using errcode = '42501';
    end if;

    new.revision := old.revision + 1;
    new.updated_at := now();
    return new;
end;
$function$;

revoke all on function private.bump_article_revision()
from public, anon, authenticated;

create table public.articles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    title text not null default '',
    publication_target text not null default 'note',
    article_type text not null default 'free',
    genre text,
    subgenre text,
    body text not null default '',
    status text not null default 'draft',
    price bigint,
    tags text[] not null default '{}'::text[],
    scheduled_at timestamptz,
    published_at timestamptz,
    published_url text,
    revision integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint articles_title_length_check
        check (length(title) <= 500),
    constraint articles_publication_target_check
        check (publication_target ~ '^[a-z][a-z0-9_-]{0,49}$'),
    constraint articles_article_type_check
        check (article_type in ('free', 'paid')),
    constraint articles_genre_length_check
        check (
            genre is null
            or length(trim(genre)) between 1 and 200
        ),
    constraint articles_subgenre_length_check
        check (
            subgenre is null
            or length(trim(subgenre)) between 1 and 200
        ),
    constraint articles_status_check
        check (
            status in (
                'draft',
                'writing',
                'ready',
                'waiting_publish',
                'published',
                'on_hold',
                'archived'
            )
        ),
    constraint articles_price_check
        check (price is null or price >= 0),
    constraint articles_free_price_check
        check (article_type = 'paid' or price is null),
    constraint articles_tags_count_check
        check (cardinality(tags) <= 50),
    constraint articles_published_url_length_check
        check (published_url is null or length(published_url) <= 2048),
    constraint articles_revision_check
        check (revision >= 1)
);

create index articles_user_created_idx
    on public.articles (user_id, created_at desc, id);

create index articles_user_publication_updated_idx
    on public.articles (user_id, publication_target, updated_at desc, id);

create index articles_user_scheduled_idx
    on public.articles (user_id, scheduled_at, id)
    where scheduled_at is not null and status = 'waiting_publish';

create index articles_user_status_updated_idx
    on public.articles (user_id, status, updated_at desc, id);

create index articles_user_updated_idx
    on public.articles (user_id, updated_at desc, id);

create trigger articles_bump_revision
before update on public.articles
for each row execute function private.bump_article_revision();

alter table public.articles enable row level security;
alter table public.articles force row level security;

revoke all on table public.articles from public, anon, authenticated;
grant select on table public.articles to authenticated;

create policy articles_select_own_active
on public.articles
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

create or replace function public.create_article(p_article jsonb default '{}'::jsonb)
returns public.articles
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    article_payload jsonb := coalesce(p_article, '{}'::jsonb);
    publication_value text;
    article_type_value text;
    article_status_value text;
    article_price_value bigint;
    article_tags_value text[];
    created_article public.articles%rowtype;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
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

create or replace function public.update_article(
    p_article_id uuid,
    p_expected_revision integer,
    p_patch jsonb
)
returns public.articles
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    article_patch jsonb := coalesce(p_patch, '{}'::jsonb);
    current_article public.articles%rowtype;
    updated_article public.articles%rowtype;
    publication_value text;
    article_type_value text;
    article_status_value text;
    article_price_value bigint;
    article_tags_value text[];
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if p_expected_revision is null or p_expected_revision < 1 then
        raise exception 'expected revision is required' using errcode = '22023';
    end if;

    if jsonb_typeof(article_patch) <> 'object' or article_patch = '{}'::jsonb then
        raise exception 'article patch must be a non-empty object' using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_object_keys(article_patch) as supplied(key)
        where not supplied.key = any (array[
            'title', 'publication_target', 'article_type', 'genre', 'subgenre',
            'body', 'status', 'price', 'tags', 'scheduled_at', 'published_at',
            'published_url'
        ])
    ) then
        raise exception 'article patch contains unsupported fields' using errcode = '22023';
    end if;

    select article.*
    into current_article
    from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id;

    if not found then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    if current_article.revision <> p_expected_revision then
        raise exception 'article revision conflict' using errcode = '40001';
    end if;

    publication_value := current_article.publication_target;
    if article_patch ? 'publication_target' then
        publication_value := case lower(trim(coalesce(article_patch ->> 'publication_target', '')))
            when 'ブログ' then 'blog'
            else lower(trim(coalesce(article_patch ->> 'publication_target', '')))
        end;
    end if;

    article_type_value := current_article.article_type;
    if article_patch ? 'article_type' then
        article_type_value := case lower(trim(coalesce(article_patch ->> 'article_type', '')))
            when '無料' then 'free'
            when '有料' then 'paid'
            else lower(trim(coalesce(article_patch ->> 'article_type', '')))
        end;
    end if;

    article_status_value := current_article.status;
    if article_patch ? 'status' then
        article_status_value := lower(trim(coalesce(article_patch ->> 'status', '')));
    end if;

    article_tags_value := current_article.tags;
    if article_patch ? 'tags' then
        article_tags_value := private.normalize_article_tags(article_patch -> 'tags');
    end if;

    article_price_value := current_article.price;
    if article_patch ? 'price' then
        article_price_value := case
            when article_patch -> 'price' = 'null'::jsonb
              or nullif(trim(article_patch ->> 'price'), '') is null
            then null
            else (article_patch ->> 'price')::bigint
        end;
    end if;
    if article_type_value = 'free' then
        article_price_value := null;
    end if;

    update public.articles as article
    set title = case
            when article_patch ? 'title' then coalesce(article_patch ->> 'title', '')
            else current_article.title
        end,
        publication_target = publication_value,
        article_type = article_type_value,
        genre = case
            when article_patch ? 'genre' then nullif(trim(article_patch ->> 'genre'), '')
            else current_article.genre
        end,
        subgenre = case
            when article_patch ? 'subgenre' then nullif(trim(article_patch ->> 'subgenre'), '')
            else current_article.subgenre
        end,
        body = case
            when article_patch ? 'body' then coalesce(article_patch ->> 'body', '')
            else current_article.body
        end,
        status = article_status_value,
        price = article_price_value,
        tags = article_tags_value,
        scheduled_at = case
            when not (article_patch ? 'scheduled_at') then current_article.scheduled_at
            when article_patch -> 'scheduled_at' = 'null'::jsonb
              or nullif(trim(article_patch ->> 'scheduled_at'), '') is null then null
            else (article_patch ->> 'scheduled_at')::timestamptz
        end,
        published_at = case
            when not (article_patch ? 'published_at') then current_article.published_at
            when article_patch -> 'published_at' = 'null'::jsonb
              or nullif(trim(article_patch ->> 'published_at'), '') is null then null
            else (article_patch ->> 'published_at')::timestamptz
        end,
        published_url = case
            when article_patch ? 'published_url' then nullif(trim(article_patch ->> 'published_url'), '')
            else current_article.published_url
        end
    where article.id = p_article_id
      and article.user_id = current_user_id
      and article.revision = p_expected_revision
    returning article.* into updated_article;

    if not found then
        raise exception 'article revision conflict' using errcode = '40001';
    end if;

    return updated_article;
end;
$function$;

revoke all on function public.update_article(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_article(uuid, integer, jsonb) to authenticated;

create or replace function public.delete_article(
    p_article_id uuid,
    p_expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_revision integer;
    deleted_article_id uuid;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if p_expected_revision is null or p_expected_revision < 1 then
        raise exception 'expected revision is required' using errcode = '22023';
    end if;

    select article.revision
    into current_revision
    from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    if current_revision <> p_expected_revision then
        raise exception 'article revision conflict' using errcode = '40001';
    end if;

    delete from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id
      and article.revision = p_expected_revision
    returning article.id into deleted_article_id;

    if deleted_article_id is null then
        raise exception 'article revision conflict' using errcode = '40001';
    end if;

    return deleted_article_id;
end;
$function$;

revoke all on function public.delete_article(uuid, integer) from public, anon;
grant execute on function public.delete_article(uuid, integer) to authenticated;

commit;
